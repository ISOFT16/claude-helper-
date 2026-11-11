package com.vigil.keyboard

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.View
import com.vigil.keyboard.Prefs.altHints
import com.vigil.keyboard.Prefs.keyBackgrounds
import com.vigil.keyboard.Prefs.keyHeight
import com.vigil.keyboard.Prefs.keyRadius
import com.vigil.keyboard.Prefs.numberRow

/** Отрисовка клавиатуры в стиле Pixel: рисуем всё сами на Canvas. */
@SuppressLint("ViewConstructor")
class PixelKeyboardView(
    context: Context,
    private val listener: Listener
) : View(context) {

    interface Listener {
        fun onKeyTapped(key: Layouts.Key)
        fun onKeyLongAlt(alt: String)
        fun onSpaceLongPress()
        fun feedback()
    }

    var mode: Layouts.Mode = Layouts.Mode.RU
        set(v) { field = v; rebuild() }

    /** 0 = выкл, 1 = shift, 2 = caps lock */
    var shiftState: Int = 0
        set(v) { field = v; invalidate() }

    var theme: KbTheme = KbTheme.resolve(context)
        set(v) { field = v; invalidate() }

    /** Надпись на пробеле (название языка, как у Gboard). */
    var spaceLabel: String = ""
        set(v) { field = v; invalidate() }

    private data class DrawnKey(val key: Layouts.Key, val rect: RectF)

    private var drawn: List<DrawnKey> = emptyList()
    private var rowsCache: List<List<Layouts.Key>> = emptyList()

    private val density = resources.displayMetrics.density
    private val gapH = 3f * density
    private val gapV = 5f * density
    private val padSide = 3f * density
    private val padTop = 6f * density
    private val padBottom = 8f * density

    private val typeface: Typeface = try {
        Typeface.createFromAsset(context.assets, "fonts/GoogleSans-Medium.ttf")
    } catch (e: Exception) { Typeface.DEFAULT }

    private val keyPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        typeface = this@PixelKeyboardView.typeface
    }
    private val hintPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.RIGHT
        typeface = this@PixelKeyboardView.typeface
    }

    // Нажатые клавиши по id указателя (мультитач для быстрой печати)
    private val pressed = HashMap<Int, DrawnKey>()
    private val longPressConsumed = HashSet<Int>()
    private val handler = Handler(Looper.getMainLooper())
    private val longPressRunnables = HashMap<Int, Runnable>()
    private var deleteRepeat: Runnable? = null

    init { rebuild() }

    fun rebuild() {
        rowsCache = Layouts.rows(mode, context.numberRow)
        requestLayout()
        invalidate()
    }

    private fun rowHeightPx() = context.keyHeight * density

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec)
        val h = (rowsCache.size * rowHeightPx() + padTop + padBottom).toInt()
        setMeasuredDimension(w, h)
    }

    override fun onSizeChanged(w: Int, h: Int, ow: Int, oh: Int) = layoutKeys()

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        super.onLayout(changed, l, t, r, b)
        layoutKeys()
    }

    private fun layoutKeys() {
        val list = ArrayList<DrawnKey>()
        val rowH = rowHeightPx()
        val innerW = width - padSide * 2
        rowsCache.forEachIndexed { ri, row ->
            val totalWeight = row.sumOf { it.weight.toDouble() }.toFloat()
            val unit = innerW / totalWeight
            var x = padSide
            val top = padTop + ri * rowH
            for (k in row) {
                val w = unit * k.weight
                list.add(
                    DrawnKey(
                        k,
                        RectF(x + gapH / 2, top + gapV / 2, x + w - gapH / 2, top + rowH - gapV / 2)
                    )
                )
                x += w
            }
        }
        drawn = list
    }

    override fun onDraw(canvas: Canvas) {
        canvas.drawColor(theme.bg)
        val radius = context.keyRadius * density
        val showBg = context.keyBackgrounds
        val showHints = context.altHints
        val letterSize = 21f * density * 0.95f
        val hintSize = 11f * density

        for (dk in drawn) {
            val k = dk.key
            val isPressed = pressed.values.any { it === dk }
            val isSpecial = k.code != Layouts.CODE_TEXT && k.code != Layouts.CODE_SPACE
            val isEnter = k.code == Layouts.CODE_ENTER
            val isActiveShift = k.code == Layouts.CODE_SHIFT && shiftState > 0

            keyPaint.color = when {
                isPressed -> theme.keyPressed
                isEnter -> theme.accent
                isActiveShift -> theme.accent
                isSpecial -> theme.keySpecial
                else -> theme.key
            }
            if (showBg || isEnter || isActiveShift || isPressed) {
                val r = if (isEnter) dk.rect.height() / 2 else radius
                canvas.drawRoundRect(dk.rect, r, r, keyPaint)
            }

            // Подпись
            var label = k.label
            if (k.code == Layouts.CODE_SPACE) label = spaceLabel
            if (k.code == Layouts.CODE_TEXT && label.length == 1 && shiftState > 0 &&
                (mode == Layouts.Mode.EN || mode == Layouts.Mode.RU) && label[0].isLetter()
            ) label = label.uppercase()
            if (k.code == Layouts.CODE_SHIFT && shiftState == 2) label = "⇪"

            textPaint.color = when {
                isEnter || isActiveShift -> theme.onAccent
                k.code == Layouts.CODE_SPACE -> theme.textSec
                else -> theme.text
            }
            textPaint.textSize = when {
                k.code == Layouts.CODE_SPACE -> letterSize * 0.55f
                label.length > 2 -> letterSize * 0.62f
                k.code != Layouts.CODE_TEXT -> letterSize * 0.9f
                else -> letterSize
            }
            val y = dk.rect.centerY() - (textPaint.descent() + textPaint.ascent()) / 2
            canvas.drawText(label, dk.rect.centerX(), y, textPaint)

            // Подсказка в углу
            if (showHints && k.alt != null) {
                hintPaint.color = theme.textSec
                hintPaint.textSize = hintSize
                canvas.drawText(
                    k.alt,
                    dk.rect.right - 5 * density,
                    dk.rect.top + hintSize + 3 * density,
                    hintPaint
                )
            }
        }
    }

    private fun keyAt(x: Float, y: Float): DrawnKey? {
        // Сначала точное попадание, потом ближайшая клавиша в том же ряду (чтобы не было «мертвых зон»)
        drawn.firstOrNull { it.rect.contains(x, y) }?.let { return it }
        return drawn
            .filter { y >= it.rect.top - gapV && y <= it.rect.bottom + gapV }
            .minByOrNull { kotlin.math.abs(it.rect.centerX() - x) }
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                val i = event.actionIndex
                val id = event.getPointerId(i)
                val dk = keyAt(event.getX(i), event.getY(i)) ?: return true
                pressed[id] = dk
                listener.feedback()
                scheduleLongPress(id, dk)
                invalidate()
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> {
                val i = event.actionIndex
                val id = event.getPointerId(i)
                val dk = pressed.remove(id)
                cancelLongPress(id)
                if (dk != null && id !in longPressConsumed) listener.onKeyTapped(dk.key)
                longPressConsumed.remove(id)
                invalidate()
            }
            MotionEvent.ACTION_CANCEL -> {
                pressed.clear()
                longPressConsumed.clear()
                longPressRunnables.keys.toList().forEach { cancelLongPress(it) }
                invalidate()
            }
        }
        return true
    }

    private fun scheduleLongPress(id: Int, dk: DrawnKey) {
        val r = Runnable {
            when {
                dk.key.code == Layouts.CODE_DELETE -> {
                    longPressConsumed.add(id)
                    listener.onKeyTapped(dk.key) // первое срабатывание
                    startDeleteRepeat(id, dk)
                }
                dk.key.code == Layouts.CODE_SPACE -> {
                    longPressConsumed.add(id)
                    listener.onSpaceLongPress()
                }
                dk.key.alt != null -> {
                    longPressConsumed.add(id)
                    listener.onKeyLongAlt(dk.key.alt)
                }
            }
        }
        longPressRunnables[id] = r
        handler.postDelayed(r, 420)
    }

    private fun startDeleteRepeat(id: Int, dk: DrawnKey) {
        val r = object : Runnable {
            override fun run() {
                if (pressed.containsKey(id)) {
                    listener.onKeyTapped(dk.key)
                    handler.postDelayed(this, 55)
                }
            }
        }
        deleteRepeat = r
        handler.postDelayed(r, 300)
    }

    private fun cancelLongPress(id: Int) {
        longPressRunnables.remove(id)?.let { handler.removeCallbacks(it) }
        deleteRepeat?.let { handler.removeCallbacks(it); deleteRepeat = null }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        handler.removeCallbacksAndMessages(null)
    }
}
