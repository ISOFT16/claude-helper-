package com.isoft16.vigilvoice

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager

/**
 * Прозрачный слой поверх экрана. Он не перехватывает касания и показывает:
 * точку-индикатор и то, что услышал телефон, а в режиме цифр — номера на кнопках.
 */
class Overlay(private val context: Context) {
    private val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val main = Handler(Looper.getMainLooper())
    private val view = Layer(context)
    private var attached = false

    private val clearMessage = Runnable {
        view.message = null
        view.invalidate()
    }

    fun attach() {
        if (attached) return
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,
        )
        if (Build.VERSION.SDK_INT >= 28) {
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        try {
            wm.addView(view, lp)
            attached = true
        } catch (_: Exception) {
        }
    }

    fun detach() {
        main.removeCallbacks(clearMessage)
        if (!attached) return
        try {
            wm.removeView(view)
        } catch (_: Exception) {
        }
        attached = false
    }

    /** Цвет точки: красная — слушаю, серая — сплю, жёлтая — диктовка. */
    fun setState(sleeping: Boolean, dictation: Boolean) {
        view.dotColor = when {
            sleeping -> 0xFF777777.toInt()
            dictation -> 0xFFFFC107.toInt()
            else -> 0xFFE53935.toInt()
        }
        view.invalidate()
    }

    /** Короткая надпись вверху экрана; [sticky] — не исчезает сама. */
    fun show(message: String?, sticky: Boolean = false) {
        main.removeCallbacks(clearMessage)
        view.message = message
        view.invalidate()
        if (message != null && !sticky) main.postDelayed(clearMessage, 3_500)
    }

    fun setNumbers(rects: List<Rect>) {
        if (view.numbers == rects) return
        view.numbers = rects
        view.invalidate()
    }

    private class Layer(context: Context) : View(context) {
        var message: String? = null
        var dotColor = 0xFFE53935.toInt()
        var numbers: List<Rect> = emptyList()

        private val dp = resources.displayMetrics.density
        private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
        private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.WHITE
            typeface = Typeface.DEFAULT_BOLD
        }
        private val box = RectF()
        private val origin = IntArray(2)

        init {
            // Слой не должен попадать в дерево экрана, которое мы сами же читаем.
            importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        }

        override fun onDraw(canvas: Canvas) {
            getLocationOnScreen(origin)
            drawNumbers(canvas)
            drawStatus(canvas)
        }

        private fun drawNumbers(canvas: Canvas) {
            if (numbers.isEmpty()) return
            text.textSize = 13 * dp
            val h = 18 * dp
            val pad = 5 * dp
            for ((i, r) in numbers.withIndex()) {
                val label = (i + 1).toString()
                val w = text.measureText(label) + pad * 2
                val left = (r.left - origin[0]).toFloat().coerceIn(0f, maxOf(0f, width - w))
                val top = (r.top - origin[1]).toFloat().coerceIn(0f, maxOf(0f, height - h))
                box.set(left, top, left + w, top + h)
                fill.color = 0xF0C62828.toInt()
                canvas.drawRoundRect(box, 5 * dp, 5 * dp, fill)
                canvas.drawText(label, left + pad, top + h - 4.5f * dp, text)
            }
        }

        private fun drawStatus(canvas: Canvas) {
            val top = 30 * dp
            val msg = message
            if (msg == null) {
                fill.color = dotColor
                canvas.drawCircle(width / 2f, top + 6 * dp, 4 * dp, fill)
                return
            }
            text.textSize = 15 * dp
            val maxWidth = width - 64 * dp
            var shown = msg
            if (text.measureText(shown) > maxWidth) {
                val n = text.breakText(shown, true, maxWidth - text.measureText("…"), null)
                shown = shown.substring(0, n) + "…"
            }
            val tw = text.measureText(shown)
            val h = 34 * dp
            val w = tw + 44 * dp
            val left = (width - w) / 2f
            box.set(left, top, left + w, top + h)
            fill.color = 0xE6101010.toInt()
            canvas.drawRoundRect(box, h / 2, h / 2, fill)
            fill.color = dotColor
            canvas.drawCircle(left + 16 * dp, top + h / 2, 5 * dp, fill)
            canvas.drawText(shown, left + 30 * dp, top + h / 2 + 5.5f * dp, text)
        }
    }
}
