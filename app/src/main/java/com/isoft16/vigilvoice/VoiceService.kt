package com.isoft16.vigilvoice

import android.accessibilityservice.AccessibilityService
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.view.accessibility.AccessibilityEvent
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Сердце приложения. Это служба специальных возможностей: система сама держит её
 * включённой и запускает после перезагрузки, поэтому телефон слушает всегда.
 */
class VoiceService : AccessibilityService() {

    companion object {
        @Volatile
        var instance: VoiceService? = null
            private set
    }

    private val main = Handler(Looper.getMainLooper())
    private var overlay: Overlay? = null
    private var listener: Listener? = null
    private var actions: Actions? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false

    private var sleeping = false
    private var dictation = false
    private var numbersOn = false

    /** Места нажатия под теми номерами, которые сейчас нарисованы на экране. */
    private var targets: List<Rect> = emptyList()

    private val refreshNumbers = Runnable {
        if (numbersOn) {
            targets = actions?.clickTargets() ?: emptyList()
            overlay?.setNumbers(targets)
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        actions = Actions(this)
        overlay = Overlay(this).also {
            it.attach()
            it.setState(sleeping, dictation)
        }
        listener = Listener(this, ::onHeard) { problem -> overlay?.show(problem, sticky = true) }
        initTts()
        goForeground()
        listener?.start()
        overlay?.show("Vigil Voice слушает")
    }

    /** Экран поменялся — номера на кнопках надо перерисовать. */
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (!numbersOn) return
        main.removeCallbacks(refreshNumbers)
        main.postDelayed(refreshNumbers, 350)
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        instance = null
        main.removeCallbacksAndMessages(null)
        listener?.stop()
        overlay?.detach()
        try {
            tts?.shutdown()
        } catch (_: Exception) {
        }
        super.onDestroy()
    }

    /** Вызывается из окна приложения, когда выдали разрешения. */
    fun permissionsChanged() {
        goForeground()
        listener?.stop()
        listener?.start()
    }

    // ---------- постоянное уведомление ----------

    private fun goForeground() {
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(
                NotificationChannel("listening", "Прослушивание", NotificationManager.IMPORTANCE_LOW),
            )
            val open = PendingIntent.getActivity(
                this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
            )
            val n = Notification.Builder(this, "listening")
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle("Vigil Voice слушает")
                .setContentText("Скажите «помощь», чтобы увидеть команды")
                .setContentIntent(open)
                .setOngoing(true)
                .build()
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(1, n)
            }
        } catch (_: Exception) {
            // Пока нет разрешения на микрофон, система не даст показать уведомление — попробуем позже.
        }
    }

    // ---------- голосовые ответы ----------

    private fun initTts() {
        tts = TextToSpeech(this) { status ->
            if (status != TextToSpeech.SUCCESS) return@TextToSpeech
            val t = tts ?: return@TextToSpeech
            t.language = Locale("ru", "RU")
            t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {}
                override fun onDone(utteranceId: String?) {
                    main.post { listener?.resume() }
                }

                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) {
                    main.post { listener?.resume() }
                }
            })
            ttsReady = true
        }
    }

    /** Показывает ответ вверху экрана и, если включено, произносит его. */
    private fun say(text: String, aloud: Boolean = false) {
        overlay?.show(text)
        if (!aloud || !ttsReady || !Prefs.voiceReplies(this)) return
        listener?.pause()
        val started = tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "reply")
        if (started != TextToSpeech.SUCCESS) listener?.resume()
    }

    // ---------- команды ----------

    private fun onHeard(text: String) {
        val cmd = CommandParser.parse(text, ParserState(dictation, numbersOn, Prefs.wakeWord(this)))
        if (cmd == Command.Ignore) return
        if (sleeping) {
            if (cmd == Command.Wake) {
                sleeping = false
                overlay?.setState(sleeping, dictation)
                say("Слушаю", aloud = true)
            }
            return
        }
        try {
            execute(cmd, text)
        } catch (e: Exception) {
            say("Ошибка: ${e.message ?: e.javaClass.simpleName}")
        }
        if (numbersOn) {
            main.removeCallbacks(refreshNumbers)
            main.postDelayed(refreshNumbers, 600)
        }
    }

    private fun execute(cmd: Command, heard: String) {
        val a = actions ?: return
        fun done(ok: Boolean, fail: String) = say(if (ok) heard else fail)

        when (cmd) {
            Command.Ignore -> {}
            is Command.Unknown -> say("Не понял: ${cmd.text}")

            Command.Sleep -> {
                sleeping = true
                setNumbers(false)
                overlay?.setState(sleeping, dictation)
                say("Не слушаю. Скажите «проснись»", aloud = true)
            }
            Command.Wake -> say("Слушаю")

            Command.Back -> done(a.global(GLOBAL_ACTION_BACK), "Не получилось")
            Command.Home -> done(a.global(GLOBAL_ACTION_HOME), "Не получилось")
            Command.Recents -> done(a.global(GLOBAL_ACTION_RECENTS), "Не получилось")
            Command.Notifications -> done(a.global(GLOBAL_ACTION_NOTIFICATIONS), "Не получилось")
            Command.QuickSettings -> done(a.global(GLOBAL_ACTION_QUICK_SETTINGS), "Не получилось")
            Command.Lock -> done(
                Build.VERSION.SDK_INT >= 28 && a.global(GLOBAL_ACTION_LOCK_SCREEN),
                "Блокировка голосом работает с Android 9",
            )
            Command.Screenshot -> done(
                Build.VERSION.SDK_INT >= 28 && a.global(GLOBAL_ACTION_TAKE_SCREENSHOT),
                "Скриншот голосом работает с Android 9",
            )
            Command.WakeScreen -> {
                val ok = a.wakeScreen()
                // Если пароля нет, смахиваем экран блокировки.
                main.postDelayed({ a.scroll(Dir.DOWN) }, 700)
                done(ok, "Не получилось включить экран")
            }
            is Command.Scroll -> done(a.scroll(cmd.dir), "Не получилось пролистать")

            Command.ShowNumbers -> {
                setNumbers(true)
                say("Назовите цифру")
            }
            Command.HideNumbers -> {
                setNumbers(false)
                say(heard)
            }
            is Command.ClickNumber -> clickNumber(a, cmd)
            is Command.ClickText -> done(a.clickText(cmd.text, cmd.long), "Не вижу на экране: ${cmd.text}")

            is Command.Type -> {
                if (!a.type(cmd.text)) say("Нет поля для ввода. Сначала нажмите на него")
                else overlay?.show(cmd.text)
            }
            Command.DictationOn -> {
                dictation = true
                overlay?.setState(sleeping, dictation)
                say("Диктовка. Чтобы закончить: «стоп диктовка»", aloud = true)
            }
            Command.DictationOff -> {
                dictation = false
                overlay?.setState(sleeping, dictation)
                say("Диктовка закончена", aloud = true)
            }
            Command.DeleteWord -> done(a.deleteWord(), "Нет поля для ввода")
            Command.ClearText -> done(a.clearText(), "Нет поля для ввода")
            Command.Send -> done(a.send(), "Не нашёл кнопку отправки")
            Command.Enter -> done(a.enter(), "Не получилось нажать ввод")

            is Command.OpenApp -> {
                val opened = a.openApp(cmd.name)
                say(if (opened != null) "Открываю $opened" else "Нет приложения: ${cmd.name}")
            }
            is Command.Search -> done(a.search(cmd.query), "Не получилось открыть поиск")
            is Command.Call -> when (val r = a.call(cmd.who)) {
                is Actions.CallResult.Calling -> say("Звоню: ${r.who}", aloud = true)
                Actions.CallResult.NoContactsPermission ->
                    say("Нет доступа к контактам. Разрешите его в Vigil Voice", aloud = true)
                Actions.CallResult.NotFound -> say("Нет контакта: ${cmd.who}", aloud = true)
                Actions.CallResult.Failed -> say("Не получилось позвонить", aloud = true)
            }
            Command.Answer -> done(a.answerCall(), "Не получилось ответить")
            Command.HangUp -> done(a.hangUp(), "Не получилось сбросить")

            Command.VolumeUp -> { a.volume(true); say(heard) }
            Command.VolumeDown -> { a.volume(false); say(heard) }
            Command.Mute -> { a.mute(true); say(heard) }
            Command.Unmute -> { a.mute(false); say(heard) }
            is Command.Media -> { a.media(cmd.key); say(heard) }
            is Command.Flashlight -> done(a.flashlight(cmd.on), "Фонарик недоступен")

            Command.Time -> say("Сейчас " + SimpleDateFormat("H:mm", Locale("ru")).format(Date()), aloud = true)
            Command.Battery -> say("Заряд ${a.batteryPercent()} процентов", aloud = true)
            Command.Help -> {
                startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                say("Команды на экране. Листайте: «вниз»")
            }
        }
    }

    private fun clickNumber(a: Actions, cmd: Command.ClickNumber) {
        if (!numbersOn) {
            // Цифры не показаны — значит, это кнопка с такой надписью (например, в калькуляторе).
            if (!a.clickText(cmd.n.toString(), cmd.long)) say("Сначала скажите «цифры»")
            else say(cmd.n.toString())
            return
        }
        val r = targets.getOrNull(cmd.n - 1)
        if (r == null) {
            say("Нет цифры ${cmd.n}")
            return
        }
        if (a.tap(r.exactCenterX(), r.exactCenterY(), cmd.long)) say(cmd.n.toString())
        else say("Не получилось нажать")
    }

    private fun setNumbers(on: Boolean) {
        numbersOn = on
        main.removeCallbacks(refreshNumbers)
        targets = if (on) actions?.clickTargets() ?: emptyList() else emptyList()
        overlay?.setNumbers(targets)
    }
}
