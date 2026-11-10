package com.vigil.keyboard

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.inputmethodservice.InputMethodService
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.text.InputType
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.ExtractedTextRequest
import android.view.inputmethod.InputMethodManager
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import com.vigil.keyboard.Prefs.keySound
import com.vigil.keyboard.Prefs.lang
import com.vigil.keyboard.Prefs.translateTo
import com.vigil.keyboard.Prefs.vibration
import com.vigil.keyboard.Prefs.vibrationMs

class VigilImeService : InputMethodService(), PixelKeyboardView.Listener {

    private lateinit var root: LinearLayout
    private lateinit var toolbar: LinearLayout
    private lateinit var statusText: TextView
    private lateinit var langLabel: TextView
    private lateinit var translatePanel: LinearLayout
    private lateinit var translateDirBtn: TextView
    private lateinit var kbView: PixelKeyboardView
    private var micBtn: ImageButton? = null

    private var theme: KbTheme? = null
    private var lastShiftTap = 0L
    private var speech: SpeechRecognizer? = null
    private var listening = false
    private var googleSans: Typeface? = null

    override fun onCreate() {
        super.onCreate()
        googleSans = try {
            Typeface.createFromAsset(assets, "fonts/GoogleSans-Medium.ttf")
        } catch (e: Exception) { null }
    }

    override fun onCreateInputView(): View {
        theme = KbTheme.resolve(this)
        val t = theme!!
        val d = resources.displayMetrics.density

        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(t.bg)
        }

        // ---------- Верхняя панель (как тулбар Gboard) ----------
        toolbar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding((8 * d).toInt(), (4 * d).toInt(), (8 * d).toInt(), 0)
        }
        fun toolBtn(iconRes: Int, onClick: () -> Unit): ImageButton =
            ImageButton(this).apply {
                setImageResource(iconRes)
                background = null
                imageTintList = android.content.res.ColorStateList.valueOf(t.textSec)
                layoutParams = LinearLayout.LayoutParams((44 * d).toInt(), (40 * d).toInt())
                setOnClickListener { feedback(); onClick() }
            }

        toolbar.addView(toolBtn(R.drawable.ic_settings) {
            val i = Intent(this, SettingsActivity::class.java)
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(i)
        })
        toolbar.addView(toolBtn(R.drawable.ic_translate) { toggleTranslatePanel() })
        micBtn = toolBtn(R.drawable.ic_mic) { toggleVoice() }
        toolbar.addView(micBtn)

        statusText = TextView(this).apply {
            setTextColor(t.textSec)
            textSize = 13f
            typeface = googleSans
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            maxLines = 1
        }
        toolbar.addView(statusText)

        langLabel = TextView(this).apply {
            setTextColor(t.textSec)
            textSize = 13f
            typeface = googleSans
            gravity = Gravity.CENTER
            setPadding((10 * d).toInt(), 0, (10 * d).toInt(), 0)
            setOnClickListener { feedback(); switchLang() }
        }
        toolbar.addView(langLabel)
        root.addView(toolbar)

        // ---------- Панель переводчика ----------
        translatePanel = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            visibility = View.GONE
            setPadding((10 * d).toInt(), (4 * d).toInt(), (10 * d).toInt(), (6 * d).toInt())
        }
        fun pillBg(color: Int) = GradientDrawable().apply {
            cornerRadius = 20 * d
            setColor(color)
        }
        translateDirBtn = TextView(this).apply {
            typeface = googleSans
            textSize = 14f
            setTextColor(t.text)
            background = pillBg(t.keySpecial)
            setPadding((16 * d).toInt(), (8 * d).toInt(), (16 * d).toInt(), (8 * d).toInt())
            setOnClickListener {
                feedback()
                translateTo = if (translateTo == "en") "ru" else "en"
                updateTranslateDir()
            }
        }
        translatePanel.addView(translateDirBtn)

        val goBtn = TextView(this).apply {
            typeface = googleSans
            textSize = 14f
            text = "Перевести"
            setTextColor(t.onAccent)
            background = pillBg(t.accent)
            setPadding((18 * d).toInt(), (8 * d).toInt(), (18 * d).toInt(), (8 * d).toInt())
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.marginStart = (8 * d).toInt()
            layoutParams = lp
            setOnClickListener { feedback(); doTranslate() }
        }
        translatePanel.addView(goBtn)

        val hint = TextView(this).apply {
            typeface = googleSans
            textSize = 12f
            text = "переводит весь набранный текст"
            setTextColor(t.textSec)
            setPadding((10 * d).toInt(), 0, 0, 0)
        }
        translatePanel.addView(hint)
        root.addView(translatePanel)

        // ---------- Сама клавиатура ----------
        kbView = PixelKeyboardView(this, this)
        kbView.theme = t
        root.addView(kbView)

        updateLangUi()
        updateTranslateDir()
        return root
    }

    override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        // Пересоздаём view, чтобы подхватить изменённые настройки/тему
        setInputView(onCreateInputView())
        applyModeForInput(info)
        autoCapitalize()
    }

    override fun onEvaluateFullscreenMode(): Boolean = false

    private fun applyModeForInput(info: EditorInfo?) {
        val cls = (info?.inputType ?: 0) and InputType.TYPE_MASK_CLASS
        kbView.mode = when (cls) {
            InputType.TYPE_CLASS_NUMBER, InputType.TYPE_CLASS_PHONE,
            InputType.TYPE_CLASS_DATETIME -> Layouts.Mode.SYM1
            else -> if (lang == "ru") Layouts.Mode.RU else Layouts.Mode.EN
        }
    }

    // ---------------- Обработка клавиш ----------------

    override fun onKeyTapped(key: Layouts.Key) {
        val ic = currentInputConnection ?: return
        when (key.code) {
            Layouts.CODE_TEXT -> {
                var text = key.label
                if (kbView.shiftState > 0 && text.length == 1 && text[0].isLetter()) {
                    text = text.uppercase()
                }
                ic.commitText(text, 1)
                if (kbView.shiftState == 1) kbView.shiftState = 0
                if (text.length == 1 && !text[0].isLetterOrDigit()) autoCapitalize()
            }
            Layouts.CODE_SPACE -> {
                ic.commitText(" ", 1)
                autoCapitalize()
            }
            Layouts.CODE_SHIFT -> {
                val now = System.currentTimeMillis()
                kbView.shiftState = when {
                    kbView.shiftState == 0 && now - lastShiftTap < 320 -> 2
                    kbView.shiftState == 0 -> 1
                    kbView.shiftState == 1 && now - lastShiftTap < 320 -> 2
                    else -> 0
                }
                lastShiftTap = now
            }
            Layouts.CODE_DELETE -> {
                sendDownUpKeyEvents(KeyEvent.KEYCODE_DEL)
                autoCapitalize()
            }
            Layouts.CODE_ENTER -> {
                val info = currentInputEditorInfo
                val action = (info?.imeOptions ?: 0) and EditorInfo.IME_MASK_ACTION
                val noAction = (info?.imeOptions ?: 0) and EditorInfo.IME_FLAG_NO_ENTER_ACTION != 0
                if (!noAction && action != EditorInfo.IME_ACTION_NONE &&
                    action != EditorInfo.IME_ACTION_UNSPECIFIED
                ) {
                    ic.performEditorAction(action)
                } else {
                    ic.commitText("\n", 1)
                    autoCapitalize()
                }
            }
            Layouts.CODE_SYM -> kbView.mode = Layouts.Mode.SYM1
            Layouts.CODE_SYM2 -> kbView.mode = Layouts.Mode.SYM2
            Layouts.CODE_SYM1 -> kbView.mode = Layouts.Mode.SYM1
            Layouts.CODE_ABC -> kbView.mode = if (lang == "ru") Layouts.Mode.RU else Layouts.Mode.EN
            Layouts.CODE_LANG -> switchLang()
        }
    }

    override fun onKeyLongAlt(alt: String) {
        var text = alt
        if (kbView.shiftState > 0 && text.length == 1 && text[0].isLetter()) text = text.uppercase()
        currentInputConnection?.commitText(text, 1)
        if (kbView.shiftState == 1) kbView.shiftState = 0
    }

    override fun onSpaceLongPress() {
        // Долгое нажатие пробела — системный выбор клавиатуры
        (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
            .showInputMethodPicker()
    }

    private fun switchLang() {
        lang = if (lang == "ru") "en" else "ru"
        if (kbView.mode == Layouts.Mode.RU || kbView.mode == Layouts.Mode.EN) {
            kbView.mode = if (lang == "ru") Layouts.Mode.RU else Layouts.Mode.EN
        }
        updateLangUi()
    }

    private fun updateLangUi() {
        langLabel.text = if (lang == "ru") "РУС" else "ENG"
    }

    private fun autoCapitalize() {
        val ic = currentInputConnection ?: return
        val info = currentInputEditorInfo ?: return
        val cls = info.inputType and InputType.TYPE_MASK_CLASS
        if (cls != InputType.TYPE_CLASS_TEXT) return
        if (kbView.shiftState == 2) return
        val caps = ic.getCursorCapsMode(info.inputType)
        kbView.shiftState = if (caps != 0) 1 else 0
    }

    // ---------------- Вибрация и звук ----------------

    override fun feedback() {
        if (vibration) {
            val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            if (Build.VERSION.SDK_INT >= 26) {
                v.vibrate(VibrationEffect.createOneShot(vibrationMs.toLong(), 120))
            } else @Suppress("DEPRECATION") v.vibrate(vibrationMs.toLong())
        }
        if (keySound) {
            (getSystemService(Context.AUDIO_SERVICE) as AudioManager)
                .playSoundEffect(AudioManager.FX_KEYPRESS_STANDARD, 0.6f)
        }
    }

    // ---------------- Переводчик ----------------

    private fun toggleTranslatePanel() {
        translatePanel.visibility =
            if (translatePanel.visibility == View.GONE) View.VISIBLE else View.GONE
        updateTranslateDir()
    }

    private fun updateTranslateDir() {
        translateDirBtn.text = if (translateTo == "en") "Авто → EN" else "Авто → РУ"
    }

    private fun doTranslate() {
        val ic = currentInputConnection ?: return
        val extracted = ic.getExtractedText(ExtractedTextRequest(), 0)
        val text = extracted?.text?.toString()?.trim()
        if (text.isNullOrEmpty()) {
            statusText.text = "Нечего переводить — сначала наберите текст"
            return
        }
        statusText.text = "Перевожу…"
        Translator.translate(text, translateTo) { result ->
            kbView.post {
                val ic2 = currentInputConnection ?: return@post
                if (result == null) {
                    statusText.text = "Не удалось перевести (нет сети?)"
                } else {
                    ic2.beginBatchEdit()
                    ic2.performContextMenuAction(android.R.id.selectAll)
                    ic2.commitText(result, 1)
                    ic2.endBatchEdit()
                    statusText.text = ""
                }
            }
        }
    }

    // ---------------- Голосовой ввод ----------------

    private fun toggleVoice() {
        if (listening) { stopVoice(); return }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            statusText.text = "Дайте доступ к микрофону в настройках VigilBoard"
            val i = Intent(this, SettingsActivity::class.java)
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            i.putExtra("requestMic", true)
            startActivity(i)
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            statusText.text = "Распознавание речи недоступно на этом устройстве"
            return
        }
        val sr = SpeechRecognizer.createSpeechRecognizer(this)
        speech = sr
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
            )
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, if (lang == "ru") "ru-RU" else "en-US")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        }
        sr.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) { statusText.text = "Говорите…" }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() { statusText.text = "Распознаю…" }
            override fun onPartialResults(partialResults: Bundle?) {
                val list = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (!list.isNullOrEmpty()) statusText.text = list[0]
            }
            override fun onResults(results: Bundle?) {
                val list = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                if (!list.isNullOrEmpty()) {
                    currentInputConnection?.commitText(list[0] + " ", 1)
                }
                stopVoice()
            }
            override fun onError(error: Int) {
                statusText.text = when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH,
                    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Не расслышал, попробуйте ещё раз"
                    SpeechRecognizer.ERROR_NETWORK -> "Нет сети для распознавания"
                    else -> "Ошибка распознавания ($error)"
                }
                stopVoice()
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        listening = true
        micBtn?.imageTintList =
            android.content.res.ColorStateList.valueOf(theme?.accent ?: 0xFF1A73E8.toInt())
        sr.startListening(intent)
    }

    private fun stopVoice() {
        listening = false
        speech?.destroy()
        speech = null
        micBtn?.imageTintList =
            android.content.res.ColorStateList.valueOf(theme?.textSec ?: 0xFF888888.toInt())
        if (statusText.text == "Говорите…" || statusText.text == "Распознаю…") statusText.text = ""
    }

    override fun onFinishInputView(finishingInput: Boolean) {
        stopVoice()
        super.onFinishInputView(finishingInput)
    }

    override fun onDestroy() {
        stopVoice()
        super.onDestroy()
    }
}
