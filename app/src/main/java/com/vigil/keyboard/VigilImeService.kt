package com.vigil.keyboard

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.ClipboardManager
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
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.vigil.keyboard.Prefs.keySound
import com.vigil.keyboard.Prefs.lang
import com.vigil.keyboard.Prefs.translateTo
import com.vigil.keyboard.Prefs.vibration
import com.vigil.keyboard.Prefs.vibrationMs

class VigilImeService : InputMethodService(), PixelKeyboardView.Listener {

    companion object {
        // Сколько показывать «таблетку» после копирования
        private const val CLIP_FRESH_MS = 5 * 60 * 1000L
    }

    private lateinit var root: LinearLayout
    private lateinit var toolbar: LinearLayout
    private lateinit var statusText: TextView
    private lateinit var langLabel: TextView
    private lateinit var translatePanel: LinearLayout
    private lateinit var translateDirBtn: TextView
    private lateinit var kbView: PixelKeyboardView
    private lateinit var clipScroll: ScrollView
    private lateinit var clipList: LinearLayout
    private lateinit var clipChip: TextView
    private var micBtn: ImageButton? = null
    private var clipListener: ClipboardManager.OnPrimaryClipChangedListener? = null
    // Текст, который уже вставили или смахнули из «таблетки», — больше её не показываем
    private var dismissedClip: String? = null

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
        // Следим за буфером обмена, пока клавиатура активна
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipListener = ClipboardManager.OnPrimaryClipChangedListener { captureClip() }
        cm.addPrimaryClipChangedListener(clipListener)
    }

    private fun captureClip() {
        try {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val text = cm.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString()
            if (!text.isNullOrBlank()) ClipStore.add(this, text)
        } catch (e: Exception) {
            // На Android 10+ чтение буфера доступно не всегда — тихо пропускаем
        }
        if (::clipChip.isInitialized) clipChip.post { updateClipChip() }
    }

    private data class RecentClip(val text: String, val sensitive: Boolean)

    /** Свежий (скопирован не раньше CLIP_FRESH_MS назад) текст из буфера, или null. */
    private fun recentClip(): RecentClip? = try {
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = cm.primaryClip
        val text = clip?.getItemAt(0)?.coerceToText(this)?.toString()
        val desc = clip?.description
        if (text.isNullOrBlank() || desc == null || text == dismissedClip) null
        else {
            // Время копирования хранится то по часам, то от загрузки — проверяем оба варианта
            val ts = desc.timestamp
            val ageWall = System.currentTimeMillis() - ts
            val ageBoot = android.os.SystemClock.elapsedRealtime() - ts
            val fresh = ts > 0 && (ageWall in 0..CLIP_FRESH_MS || ageBoot in 0..CLIP_FRESH_MS)
            val sensitive = Build.VERSION.SDK_INT >= 33 &&
                    desc.extras?.getBoolean(android.content.ClipDescription.EXTRA_IS_SENSITIVE) == true
            if (fresh) RecentClip(text, sensitive) else null
        }
    } catch (e: Exception) {
        null
    }

    private fun updateClipChip() {
        if (!::clipChip.isInitialized) return
        val rc = if (statusText.text.isNullOrEmpty()) recentClip() else null
        if (rc == null) {
            clipChip.visibility = View.GONE
            return
        }
        val preview = if (rc.sensitive) "••••••" else
            rc.text.replace(Regex("\\s+"), " ").trim()
        clipChip.text = preview
        clipChip.tag = rc.text
        clipChip.visibility = View.VISIBLE
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
        toolbar.addView(toolBtn(R.drawable.ic_clipboard) { toggleClipPanel() })
        micBtn = toolBtn(R.drawable.ic_mic) { toggleVoice() }
        toolbar.addView(micBtn)

        // Середина панели: либо статус (перевод/голос), либо «таблетка» с последним скопированным
        val middle = android.widget.FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        statusText = TextView(this).apply {
            setTextColor(t.textSec)
            textSize = 13f
            typeface = googleSans
            gravity = Gravity.CENTER
            layoutParams = android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                android.widget.FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
            )
            maxLines = 1
        }
        clipChip = TextView(this).apply {
            setTextColor(t.text)
            textSize = 13f
            typeface = googleSans
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
            visibility = View.GONE
            background = GradientDrawable().apply {
                cornerRadius = 18 * d
                setColor(t.keySpecial)
            }
            setPadding((12 * d).toInt(), (7 * d).toInt(), (12 * d).toInt(), (7 * d).toInt())
            layoutParams = android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.WRAP_CONTENT,
                android.widget.FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
            )
            // Одно нажатие — вставить скопированное
            setOnClickListener {
                val text = tag as? String ?: return@setOnClickListener
                feedback()
                currentInputConnection?.commitText(text, 1)
                dismissedClip = text
                visibility = View.GONE
            }
            // Долгое нажатие — убрать подсказку
            setOnLongClickListener {
                feedback()
                dismissedClip = tag as? String
                visibility = View.GONE
                true
            }
        }
        statusText.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) { updateClipChip() }
        })
        middle.addView(statusText)
        middle.addView(clipChip)
        toolbar.addView(middle)

        langLabel = TextView(this).apply {
            setTextColor(t.textSec)
            textSize = 13f
            typeface = googleSans
            gravity = Gravity.CENTER
            setPadding((10 * d).toInt(), 0, (10 * d).toInt(), 0)
            setOnClickListener { feedback(); switchLang() }
        }
        toolbar.addView(langLabel)
        toolbar.addView(toolBtn(R.drawable.ic_hide) { requestHideSelf(0) })
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

        // ---------- Панель буфера обмена (вместо клавиш, как у Gboard) ----------
        clipList = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding((10 * d).toInt(), (6 * d).toInt(), (10 * d).toInt(), (10 * d).toInt())
        }
        clipScroll = ScrollView(this).apply {
            visibility = View.GONE
            addView(clipList)
        }
        root.addView(clipScroll)

        // ---------- Сама клавиатура ----------
        kbView = PixelKeyboardView(this, this)
        kbView.theme = t
        root.addView(kbView)
        // Панель буфера — той же высоты, что клавиатура
        clipScroll.layoutParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            (Prefs.sp(this).getInt("keyHeight", 56) * 4 * d + 14 * d).toInt()
        )

        updateLangUi()
        updateTranslateDir()

        // Android 15+: окно клавиатуры рисуется от края до края, и системные кнопки
        // (скрыть клавиатуру / смена раскладки) ложатся поверх нижнего ряда.
        // Резервируем место под жестовую панель — клавиатура поднимается выше.
        root.setOnApplyWindowInsetsListener { v, insets ->
            val bottom = if (Build.VERSION.SDK_INT >= 30)
                insets.getInsets(android.view.WindowInsets.Type.navigationBars()).bottom
            else @Suppress("DEPRECATION") insets.systemWindowInsetBottom
            if (v.paddingBottom != bottom) v.setPadding(0, 0, 0, bottom)
            insets
        }
        root.requestApplyInsets()
        @Suppress("DEPRECATION")
        window?.window?.let { w ->
            w.navigationBarColor = t.bg
            if (Build.VERSION.SDK_INT >= 29) w.isNavigationBarContrastEnforced = false
        }
        return root
    }

    override fun onStartInputView(info: EditorInfo?, restarting: Boolean) {
        super.onStartInputView(info, restarting)
        // Пересоздаём view, чтобы подхватить изменённые настройки/тему
        setInputView(onCreateInputView())
        applyModeForInput(info)
        autoCapitalize()
        // Подхватываем то, что скопировали, пока клавиатура была закрыта
        captureClip()
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
        // Долгое нажатие пробела — переключение языка (как глобус)
        switchLang()
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
        if (::kbView.isInitialized) {
            kbView.spaceLabel = if (lang == "ru") "Русский" else "English"
        }
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
        closeClipPanel()
        translatePanel.visibility =
            if (translatePanel.visibility == View.GONE) View.VISIBLE else View.GONE
        updateTranslateDir()
    }

    private fun updateTranslateDir() {
        translateDirBtn.text = if (translateTo == "en") "Перевод на EN" else "Перевод на РУ"
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

    // ---------------- Буфер обмена ----------------

    private fun toggleClipPanel() {
        if (clipScroll.visibility == View.VISIBLE) { closeClipPanel(); return }
        captureClip()
        buildClipList()
        translatePanel.visibility = View.GONE
        clipScroll.visibility = View.VISIBLE
        kbView.visibility = View.GONE
    }

    private fun closeClipPanel() {
        clipScroll.visibility = View.GONE
        kbView.visibility = View.VISIBLE
    }

    private fun buildClipList() {
        val t = theme ?: return
        val d = resources.displayMetrics.density
        clipList.removeAllViews()

        // Шапка: заголовок, «Очистить», закрыть
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, (6 * d).toInt())
        }
        header.addView(TextView(this).apply {
            text = "Буфер обмена"
            typeface = googleSans
            textSize = 15f
            setTextColor(t.text)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        header.addView(TextView(this).apply {
            text = "Очистить"
            typeface = googleSans
            textSize = 14f
            setTextColor(t.accent)
            setPadding((12 * d).toInt(), (6 * d).toInt(), (12 * d).toInt(), (6 * d).toInt())
            setOnClickListener {
                feedback()
                ClipStore.clear(this@VigilImeService)
                buildClipList()
            }
        })
        header.addView(ImageButton(this).apply {
            setImageResource(R.drawable.ic_close)
            background = null
            imageTintList = android.content.res.ColorStateList.valueOf(t.textSec)
            layoutParams = LinearLayout.LayoutParams((40 * d).toInt(), (36 * d).toInt())
            setOnClickListener { feedback(); closeClipPanel() }
        })
        clipList.addView(header)

        val items = ClipStore.list(this)
        if (items.isEmpty()) {
            clipList.addView(TextView(this).apply {
                text = "Пока пусто.\nСкопируйте любой текст — он появится здесь."
                typeface = googleSans
                textSize = 14f
                setTextColor(t.textSec)
                gravity = Gravity.CENTER
                setPadding(0, (40 * d).toInt(), 0, 0)
            })
            return
        }

        for (item in items) {
            clipList.addView(TextView(this).apply {
                text = item
                typeface = googleSans
                textSize = 14f
                setTextColor(t.text)
                maxLines = 3
                ellipsize = android.text.TextUtils.TruncateAt.END
                background = GradientDrawable().apply {
                    cornerRadius = 14 * d
                    setColor(t.key)
                }
                val pad = (12 * d).toInt()
                setPadding(pad, pad, pad, pad)
                val lp = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                )
                lp.bottomMargin = (6 * d).toInt()
                layoutParams = lp
                setOnClickListener {
                    feedback()
                    currentInputConnection?.commitText(item, 1)
                    dismissedClip = item
                    closeClipPanel()
                    updateClipChip()
                }
                setOnLongClickListener {
                    feedback()
                    ClipStore.remove(this@VigilImeService, item)
                    buildClipList()
                    true
                }
            })
        }

        clipList.addView(TextView(this).apply {
            text = "Нажмите — вставить · Долгое нажатие — удалить"
            typeface = googleSans
            textSize = 12f
            setTextColor(t.textSec)
            gravity = Gravity.CENTER
            setPadding(0, (4 * d).toInt(), 0, 0)
        })
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
        clipListener?.let {
            (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager)
                .removePrimaryClipChangedListener(it)
        }
        super.onDestroy()
    }
}
