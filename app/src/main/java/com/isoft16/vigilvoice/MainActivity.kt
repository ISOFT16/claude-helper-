package com.isoft16.vigilvoice

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Экран первой настройки и справка по командам. Один раз его проходит помощник
 * (выдаёт разрешения), дальше приложение работает само и этот экран не нужен.
 */
class MainActivity : Activity() {

    private val bg = 0xFF070707.toInt()
    private val card = 0xFF161616.toInt()
    private val red = 0xFFE53935.toInt()
    private val green = 0xFF43A047.toInt()
    private val dim = 0xFF9E9E9E.toInt()

    private lateinit var micStatus: TextView
    private lateinit var micButton: Button
    private lateinit var serviceStatus: TextView
    private lateinit var serviceButton: Button
    private lateinit var summary: TextView

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(28), dp(20), dp(40))
        }

        root.addView(text("Vigil Voice", 30, Color.WHITE, bold = true))
        root.addView(text("Управление телефоном голосом — без рук", 16, dim))
        summary = text("", 18, Color.WHITE, bold = true).also { root.addView(it, margin(top = 20)) }

        // Шаг 1 — микрофон и звонки
        val step1 = section(root, "1. Микрофон, контакты и звонки")
        micStatus = text("", 16, dim).also { step1.addView(it) }
        micButton = button("Разрешить") { askPermissions() }.also { step1.addView(it, margin(top = 12)) }

        // Шаг 2 — служба специальных возможностей
        val step2 = section(root, "2. Управление экраном")
        serviceStatus = text("", 16, dim).also { step2.addView(it) }
        serviceButton = button("Открыть «Специальные возможности»") {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }.also { step2.addView(it, margin(top = 12)) }
        step2.addView(
            text(
                "В списке найдите Vigil Voice и включите. Если переключатель серый и пишет " +
                    "«Настройка ограничена»: откройте сведения о приложении, нажмите ⋮ в правом верхнем " +
                    "углу → «Разрешить ограниченные настройки», потом вернитесь сюда.",
                14, dim,
            ),
            margin(top = 12),
        )
        step2.addView(
            button("Сведения о приложении", outlined = true) {
                startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)),
                )
            },
            margin(top = 12),
        )

        // Настройки
        val settings = section(root, "Настройки")
        settings.addView(text("Слово-обращение", 16, Color.WHITE, bold = true))
        settings.addView(
            text(
                "Пусто — телефон выполняет любую услышанную команду. Если вписать слово, например " +
                    "«телефон», команды надо начинать с него: «телефон, назад». Так он не будет " +
                    "реагировать на чужие разговоры и телевизор.",
                14, dim,
            ),
        )
        settings.addView(
            EditText(this).apply {
                setText(Prefs.wakeWord(this@MainActivity))
                hint = "без обращения"
                setTextColor(Color.WHITE)
                setHintTextColor(dim)
                textSize = 18f
                inputType = InputType.TYPE_CLASS_TEXT
                maxLines = 1
                addTextChangedListener(object : TextWatcher {
                    override fun afterTextChanged(s: Editable?) = Prefs.setWakeWord(this@MainActivity, s.toString())
                    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                })
            },
        )
        settings.addView(
            CheckBox(this).apply {
                text = "Отвечать голосом"
                textSize = 16f
                setTextColor(Color.WHITE)
                isChecked = Prefs.voiceReplies(this@MainActivity)
                setOnCheckedChangeListener { _, on -> Prefs.setVoiceReplies(this@MainActivity, on) }
            },
            margin(top = 8),
        )

        // Команды
        val help = section(root, "Что говорить")
        for ((title, lines) in HELP) {
            help.addView(text(title, 16, red, bold = true), margin(top = 14))
            help.addView(text(lines, 16, Color.WHITE).apply { setLineSpacing(dp(4).toFloat(), 1f) })
        }

        setContentView(ScrollView(this).apply {
            setBackgroundColor(bg)
            addView(root)
        })
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun wantedPermissions(): List<String> = buildList {
        add(Manifest.permission.RECORD_AUDIO)
        add(Manifest.permission.READ_CONTACTS)
        add(Manifest.permission.CALL_PHONE)
        add(Manifest.permission.ANSWER_PHONE_CALLS)
        if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun has(p: String) = checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED

    private fun askPermissions() {
        val missing = wantedPermissions().filterNot(::has)
        if (missing.isEmpty()) return
        // После двух отказов система перестаёт показывать окно — тогда ведём в настройки приложения.
        if (missing.any { shouldShowRequestPermissionRationale(it) } || !askedBefore) {
            askedBefore = true
            requestPermissions(missing.toTypedArray(), 1)
        } else {
            startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)),
            )
        }
    }

    private var askedBefore = false

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        VoiceService.instance?.permissionsChanged()
        refresh()
    }

    private fun serviceEnabled(): Boolean {
        if (VoiceService.instance != null) return true
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
        return enabled?.contains("$packageName/") == true
    }

    private fun refresh() {
        val mic = has(Manifest.permission.RECORD_AUDIO)
        val extras = wantedPermissions().drop(1).all(::has)
        micStatus.text = when {
            !mic -> "✗ Микрофон не разрешён — телефон вас не услышит"
            !extras -> "✓ Микрофон разрешён. Для звонков голосом разрешите ещё контакты и телефон"
            else -> "✓ Всё разрешено"
        }
        micStatus.setTextColor(if (mic) green else red)
        micButton.visibility = if (mic && extras) View.GONE else View.VISIBLE

        val on = serviceEnabled()
        serviceStatus.text = if (on) "✓ Включено" else "✗ Выключено — телефон не сможет нажимать и листать"
        serviceStatus.setTextColor(if (on) green else red)
        serviceButton.text = if (on) "Открыть «Специальные возможности»" else "Включить"

        summary.text = if (mic && on) "● Телефон слушает. Скажите «домой»" else "Осталось настроить:"
        summary.setTextColor(if (mic && on) green else Color.WHITE)
    }

    // ---------- мелкие помощники для вёрстки ----------

    private fun margin(top: Int = 0) = LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(top) }

    private fun text(s: String, size: Int, color: Int, bold: Boolean = false) = TextView(this).apply {
        text = s
        textSize = size.toFloat()
        setTextColor(color)
        if (bold) typeface = Typeface.DEFAULT_BOLD
    }

    private fun section(root: LinearLayout, title: String): LinearLayout {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
            background = GradientDrawable().apply {
                setColor(card)
                cornerRadius = dp(16).toFloat()
            }
        }
        box.addView(text(title, 19, Color.WHITE, bold = true), margin().apply { bottomMargin = dp(8) })
        root.addView(box, margin(top = 16))
        return box
    }

    private fun button(label: String, outlined: Boolean = false, onClick: () -> Unit) = Button(this).apply {
        text = label
        textSize = 16f
        isAllCaps = false
        setTextColor(Color.WHITE)
        gravity = Gravity.CENTER
        minHeight = dp(56)
        background = GradientDrawable().apply {
            cornerRadius = dp(14).toFloat()
            if (outlined) {
                setColor(Color.TRANSPARENT)
                setStroke(dp(1), dim)
            } else {
                setColor(red)
            }
        }
        setOnClickListener { onClick() }
    }

    private companion object {
        val HELP = listOf(
            "Движение" to "«назад», «домой», «недавние»\n«вниз», «вверх», «влево», «вправо»\n" +
                "«уведомления», «быстрые настройки»",
            "Нажатия" to "«нажми Отправить» — по надписи на кнопке\n" +
                "«цифры» — на всём, что можно нажать, появятся номера; назовите номер\n" +
                "«долго нажми 5», «скрой цифры»",
            "Текст" to "«напиши привет запятая как дела»\n" +
                "«диктовка» — всё сказанное печатается, пока не скажете «стоп диктовка»\n" +
                "знаки: «запятая», «точка», «вопросительный знак», «новая строка»\n" +
                "«сотри» — последнее слово, «сотри всё», «отправь», «ввод»",
            "Приложения и поиск" to "«открой Ютуб», «открой настройки»\n«найди погода завтра»",
            "Звонки" to "«позвони маме», «набери 8 900 …»\n«ответь», «положи трубку»",
            "Звук и музыка" to "«громче», «тише», «без звука», «включи звук»\n" +
                "«пауза», «играй», «следующая», «предыдущая»",
            "Телефон" to "«скриншот», «заблокируй», «включи экран»\n«включи фонарик», «выключи фонарик»\n" +
                "«который час», «заряд»",
            "Прослушивание" to "«не слушай» — телефон перестаёт выполнять команды\n" +
                "«проснись» — слушает снова\n«помощь» — открыть этот список",
        )
    }
}
