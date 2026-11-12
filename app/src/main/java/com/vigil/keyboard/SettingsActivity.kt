package com.vigil.keyboard

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.vigil.keyboard.Prefs.accent
import com.vigil.keyboard.Prefs.altHints
import com.vigil.keyboard.Prefs.keyBackgrounds
import com.vigil.keyboard.Prefs.keyHeight
import com.vigil.keyboard.Prefs.keyRadius
import com.vigil.keyboard.Prefs.keySound
import com.vigil.keyboard.Prefs.numberRow
import com.vigil.keyboard.Prefs.vibration
import com.vigil.keyboard.Prefs.vibrationMs

/** Настройки клавиатуры. Весь UI построен кодом, в стиле Pixel. */
class SettingsActivity : AppCompatActivity() {

    private var googleSans: Typeface? = null
    private var googleSansBold: Typeface? = null
    private val d by lazy { resources.displayMetrics.density }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        googleSans = runCatching {
            Typeface.createFromAsset(assets, "fonts/GoogleSans-Regular.ttf")
        }.getOrNull()
        googleSansBold = runCatching {
            Typeface.createFromAsset(assets, "fonts/GoogleSans-Bold.ttf")
        }.getOrNull()

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = (20 * d).toInt()
            setPadding(p, (28 * d).toInt(), p, p)
        }
        buildUi(content)
        setContentView(ScrollView(this).apply { addView(content) })

        if (intent.getBooleanExtra("requestMic", false)) requestMic()
    }

    // ---------- Готовые элементы ----------

    private fun title(text: String) = TextView(this).apply {
        this.text = text
        textSize = 26f
        typeface = googleSansBold
        setPadding(0, 0, 0, (4 * d).toInt())
    }

    private fun section(text: String) = TextView(this).apply {
        this.text = text
        textSize = 14f
        typeface = googleSansBold
        setTextColor(0xFF1A73E8.toInt())
        setPadding(0, (22 * d).toInt(), 0, (6 * d).toInt())
    }

    private fun caption(text: String) = TextView(this).apply {
        this.text = text
        textSize = 13f
        typeface = googleSans
        alpha = 0.65f
        setPadding(0, 0, 0, (6 * d).toInt())
    }

    private fun pixelButton(text: String, filled: Boolean = true, onClick: () -> Unit) =
        Button(this).apply {
            this.text = text
            typeface = googleSans
            isAllCaps = false
            textSize = 15f
            background = GradientDrawable().apply {
                cornerRadius = 24 * d
                if (filled) setColor(0xFF1A73E8.toInt())
                else { setColor(Color.TRANSPARENT); setStroke((1.5f * d).toInt(), 0xFF747775.toInt()) }
            }
            setTextColor(if (filled) Color.WHITE else 0xFF1A73E8.toInt())
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, (48 * d).toInt()
            )
            lp.topMargin = (8 * d).toInt()
            layoutParams = lp
            setOnClickListener { onClick() }
        }

    private fun switchRow(text: String, value: Boolean, onChange: (Boolean) -> Unit) =
        SwitchCompat(this).apply {
            this.text = text
            typeface = googleSans
            textSize = 16f
            isChecked = value
            setPadding(0, (12 * d).toInt(), 0, (12 * d).toInt())
            setOnCheckedChangeListener { _, checked -> onChange(checked) }
        }

    private fun seekRow(
        parent: LinearLayout, label: String, min: Int, max: Int, value: Int,
        unit: String, onChange: (Int) -> Unit
    ) {
        val tv = TextView(this).apply {
            text = "$label: $value $unit"
            typeface = googleSans
            textSize = 16f
            setPadding(0, (10 * d).toInt(), 0, 0)
        }
        val seek = SeekBar(this).apply {
            this.max = max - min
            progress = value - min
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(sb: SeekBar?, p: Int, fromUser: Boolean) {
                    tv.text = "$label: ${p + min} $unit"
                    onChange(p + min)
                }
                override fun onStartTrackingTouch(sb: SeekBar?) {}
                override fun onStopTrackingTouch(sb: SeekBar?) {}
            })
        }
        parent.addView(tv); parent.addView(seek)
    }

    // ---------- Сборка экрана ----------

    private fun buildUi(c: LinearLayout) {
        c.addView(title("VigilBoard"))
        c.addView(caption("Клавиатура в стиле Pixel: русский и английский, переводчик, голосовой ввод."))

        // Поле для проверки
        c.addView(EditText(this).apply {
            hint = "Поле для проверки клавиатуры — нажмите сюда"
            typeface = googleSans
            textSize = 16f
            background = GradientDrawable().apply {
                cornerRadius = 16 * d
                setColor(0x141A73E8)
            }
            val pad = (14 * d).toInt()
            setPadding(pad, pad, pad, pad)
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.topMargin = (10 * d).toInt()
            layoutParams = lp
        })

        c.addView(section("Включение"))
        c.addView(pixelButton("1. Включить VigilBoard в системе") {
            startActivity(Intent(Settings.ACTION_INPUT_METHOD_SETTINGS))
        })
        c.addView(pixelButton("2. Выбрать VigilBoard как клавиатуру") {
            (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager)
                .showInputMethodPicker()
        })
        c.addView(pixelButton("3. Разрешить микрофон (для голосового ввода)", filled = false) {
            requestMic()
        })

        c.addView(section("Тема"))
        val themes = listOf(
            "auto" to "Как в системе", "light" to "Светлая", "dark" to "Тёмная",
            "amoled" to "AMOLED (чёрная)", "dynamic" to "Material You (цвета обоев)"
        )
        val themeRow = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        lateinit var refreshThemes: () -> Unit
        refreshThemes = {
            themeRow.removeAllViews()
            val current = Prefs.sp(this).getString("theme", "auto")
            for ((key, label) in themes) {
                themeRow.addView(TextView(this).apply {
                    text = (if (key == current) "●  " else "○  ") + label
                    typeface = googleSans
                    textSize = 16f
                    setPadding(0, (10 * d).toInt(), 0, (10 * d).toInt())
                    setOnClickListener {
                        Prefs.sp(this@SettingsActivity).edit().putString("theme", key).apply()
                        refreshThemes()
                    }
                })
            }
        }
        refreshThemes()
        c.addView(themeRow)

        c.addView(section("Цвет акцента"))
        c.addView(caption("Используется для Enter и активных кнопок (кроме темы Material You)"))
        val colors = listOf(
            0xFF1A73E8.toInt(), 0xFF188038.toInt(), 0xFFD93025.toInt(), 0xFF9334E6.toInt(),
            0xFFE8710A.toInt(), 0xFF129EAF.toInt(), 0xFFD01884.toInt(), 0xFF5F6368.toInt()
        )
        val swatches = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, (6 * d).toInt(), 0, 0)
        }
        lateinit var refreshSwatches: () -> Unit
        refreshSwatches = {
            swatches.removeAllViews()
            for (color in colors) {
                swatches.addView(TextView(this).apply {
                    background = GradientDrawable().apply {
                        shape = GradientDrawable.OVAL
                        setColor(color)
                        if (color == accent) setStroke((3 * d).toInt(), 0xFF202124.toInt())
                    }
                    val size = (36 * d).toInt()
                    val lp = LinearLayout.LayoutParams(size, size)
                    lp.marginEnd = (10 * d).toInt()
                    layoutParams = lp
                    setOnClickListener { accent = color; refreshSwatches() }
                })
            }
        }
        refreshSwatches()
        c.addView(swatches)

        c.addView(section("Вид клавиш"))
        seekRow(c, "Высота ряда", 40, 72, keyHeight, "dp") { keyHeight = it }
        seekRow(c, "Скругление углов", 0, 28, keyRadius, "dp") { keyRadius = it }
        c.addView(switchRow("Отдельный ряд цифр", numberRow) { numberRow = it })
        c.addView(switchRow("Фон у клавиш (выкл = плоский стиль)", keyBackgrounds) { keyBackgrounds = it })
        c.addView(switchRow("Подсказки символов в углу клавиш", altHints) { altHints = it })

        c.addView(section("Отклик"))
        c.addView(switchRow("Вибрация при нажатии", vibration) { vibration = it })
        seekRow(c, "Сила вибрации", 5, 50, vibrationMs, "мс") { vibrationMs = it }
        c.addView(switchRow("Звук клавиш", keySound) { keySound = it })

        c.addView(section("Подсказки"))
        c.addView(caption(
            "• Надпись РУС/ENG на верхней панели — переключение языка.\n" +
            "• Долгое нажатие на букву — символ из уголка (ё — на «е», ъ — на «ь»).\n" +
            "• Долгое нажатие на пробел — тоже переключение языка.\n" +
            "• Кнопка перевода на верхней панели переводит весь набранный текст.\n" +
            "• Микрофон — голосовой ввод на текущем языке.\n\n" +
            "Все изменения настроек применяются при следующем открытии клавиатуры.\n\n" +
            "Шрифт Google Sans — лицензия SIL OFL (файл OFL.txt в приложении)."
        ))
    }

    private fun requestMic() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            == PackageManager.PERMISSION_GRANTED
        ) {
            Toast.makeText(this, "Микрофон уже разрешён", Toast.LENGTH_SHORT).show()
        } else {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.RECORD_AUDIO), 1)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 1) {
            val ok = grantResults.isNotEmpty() &&
                    grantResults[0] == PackageManager.PERMISSION_GRANTED
            Toast.makeText(
                this,
                if (ok) "Микрофон разрешён, голосовой ввод работает"
                else "Без микрофона голосовой ввод работать не будет",
                Toast.LENGTH_LONG
            ).show()
        }
    }
}
