package com.isoft16.vigillauncher

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.graphics.RectF
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.text.TextPaint
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.OverScroller
import android.widget.PopupWindow
import android.widget.TextView
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.roundToInt

/** Иконка приложения с подписью. Рисуется вручную, чтобы значок и текст стояли по центру ячейки. */
@SuppressLint("ViewConstructor")
class BubbleView(context: Context) : View(context) {
    var entry: AppEntry? = null
        private set
    var homeItem: HomeItem? = null
        private set

    private var showLabel = true
    private val iconSize = context.dpi(ICON_DP)
    private val gap = context.dp(6f)
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val pressedFilter = PorterDuffColorFilter(0x33000000, PorterDuff.Mode.SRC_ATOP)
    private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        textSize = TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_SP, 12.5f, context.resources.displayMetrics
        )
        typeface = Fonts.regular(context)
    }
    private val iconRect = RectF()
    private var label: String? = null

    init {
        isClickable = true
        isFocusable = true
    }

    fun bind(entry: AppEntry, item: HomeItem?, showLabel: Boolean, textColor: Int, shadow: Boolean) {
        this.entry = entry
        this.homeItem = item
        this.showLabel = showLabel
        textPaint.color = textColor
        if (shadow) {
            textPaint.setShadowLayer(context.dp(3f), 0f, context.dp(1f), 0x99000000.toInt())
        } else {
            textPaint.clearShadowLayer()
        }
        label = null
        contentDescription = entry.label
        invalidate()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        label = null
    }

    override fun drawableStateChanged() {
        super.drawableStateChanged()
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val app = entry ?: return
        val metrics = textPaint.fontMetrics
        val textHeight = if (showLabel) metrics.descent - metrics.ascent else 0f
        val contentHeight = iconSize + if (showLabel) gap + textHeight else 0f
        val top = (height - contentHeight) / 2f
        val left = (width - iconSize) / 2f
        iconRect.set(left, top, left + iconSize, top + iconSize)
        iconPaint.colorFilter = if (isPressed) pressedFilter else null
        canvas.drawBitmap(app.icon, null, iconRect, iconPaint)
        if (showLabel) {
            val text = label ?: TextUtils.ellipsize(
                app.label, textPaint, (width - context.dp(6f)).coerceAtLeast(0f),
                TextUtils.TruncateAt.END
            ).toString().also { label = it }
            canvas.drawText(text, width / 2f, top + iconSize + gap - metrics.ascent, textPaint)
        }
    }
}

/** Сетка ячеек: один экран рабочего стола или док-панель. */
@SuppressLint("ViewConstructor")
class CellLayout(context: Context, val cols: Int, val rows: Int) : ViewGroup(context) {
    class CellParams(val cellX: Int, val cellY: Int, val spanX: Int, val spanY: Int) :
        LayoutParams(0, 0)

    private var highlightX = -1
    private var highlightY = -1
    private val highlightPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x40FFFFFF }
    private val highlightRect = RectF()

    init {
        setWillNotDraw(false)
    }

    private val cellWidth: Float
        get() = (width - paddingLeft - paddingRight).toFloat() / cols
    private val cellHeight: Float
        get() = (height - paddingTop - paddingBottom).toFloat() / rows

    fun addItem(view: View, cellX: Int, cellY: Int, spanX: Int = 1, spanY: Int = 1) {
        addView(view, CellParams(cellX, cellY, spanX, spanY))
    }

    override fun checkLayoutParams(p: LayoutParams?): Boolean = p is CellParams

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec)
        val h = MeasureSpec.getSize(heightMeasureSpec)
        setMeasuredDimension(w, h)
        val cw = (w - paddingLeft - paddingRight).toFloat() / cols
        val ch = (h - paddingTop - paddingBottom).toFloat() / rows
        for (i in 0 until childCount) {
            val child = getChildAt(i)
            val lp = child.layoutParams as CellParams
            child.measure(
                MeasureSpec.makeMeasureSpec((cw * lp.spanX).toInt(), MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec((ch * lp.spanY).toInt(), MeasureSpec.EXACTLY),
            )
        }
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val cw = cellWidth
        val ch = cellHeight
        for (i in 0 until childCount) {
            val child = getChildAt(i)
            val lp = child.layoutParams as CellParams
            val left = (paddingLeft + cw * lp.cellX).toInt()
            val top = (paddingTop + ch * lp.cellY).toInt()
            child.layout(left, top, left + child.measuredWidth, top + child.measuredHeight)
        }
    }

    /** Ячейка под точкой в координатах этой сетки. */
    fun cellAt(x: Float, y: Float): IntArray {
        val cw = cellWidth
        val ch = cellHeight
        if (cw <= 0f || ch <= 0f) return intArrayOf(0, 0)
        val cx = floor((x - paddingLeft) / cw).toInt().coerceIn(0, cols - 1)
        val cy = floor((y - paddingTop) / ch).toInt().coerceIn(0, rows - 1)
        return intArrayOf(cx, cy)
    }

    fun setHighlight(x: Int, y: Int) {
        if (x == highlightX && y == highlightY) return
        highlightX = x
        highlightY = y
        invalidate()
    }

    fun clearHighlight() = setHighlight(-1, -1)

    override fun onDraw(canvas: Canvas) {
        if (highlightX < 0 || highlightY < 0) return
        val cw = cellWidth
        val ch = cellHeight
        val size = context.dp(ICON_DP + 16f)
        val centerX = paddingLeft + cw * (highlightX + 0.5f)
        val centerY = paddingTop + ch * (highlightY + 0.5f)
        highlightRect.set(
            centerX - size / 2f, centerY - size / 2f, centerX + size / 2f, centerY + size / 2f
        )
        val radius = context.dp(20f)
        canvas.drawRoundRect(highlightRect, radius, radius, highlightPaint)
    }
}

/** Экраны рабочего стола, которые листаются по горизонтали. */
class Workspace(context: Context) : ViewGroup(context) {
    private val scroller = OverScroller(context)
    private val minFling = context.dp(350f)

    var currentPage = 0
        private set
    var onPageChanged: ((Int) -> Unit)? = null
    var onScrolled: (() -> Unit)? = null

    val pageCount: Int
        get() = childCount

    fun page(index: Int): CellLayout = getChildAt(index) as CellLayout

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec)
        val h = MeasureSpec.getSize(heightMeasureSpec)
        setMeasuredDimension(w, h)
        for (i in 0 until childCount) {
            getChildAt(i).measure(
                MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY),
            )
        }
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val w = r - l
        val h = b - t
        for (i in 0 until childCount) {
            getChildAt(i).layout(i * w, 0, (i + 1) * w, h)
        }
        if (changed && scroller.isFinished) scrollTo(currentPage * w, 0)
    }

    /** Тянет экраны за пальцем; за краями движение замедляется. */
    fun dragBy(dx: Float) {
        if (!scroller.isFinished) scroller.abortAnimation()
        val max = ((childCount - 1) * width).coerceAtLeast(0)
        val outside = scrollX < 0 || scrollX > max
        val step = if (outside) dx * 0.35f else dx
        val limit = width / 4
        scrollTo((scrollX + step).roundToInt().coerceIn(-limit, max + limit), 0)
    }

    /** Доводит до ближайшего экрана после отпускания пальца. */
    fun settle(velocityX: Float) {
        if (width == 0) return
        val position = scrollX.toFloat() / width
        val target = when {
            velocityX < -minFling -> ceil(position).toInt()
            velocityX > minFling -> floor(position).toInt()
            else -> position.roundToInt()
        }
        snapToPage(target, true)
    }

    fun snapToPage(index: Int, animate: Boolean) {
        val page = index.coerceIn(0, (childCount - 1).coerceAtLeast(0))
        val changed = page != currentPage
        currentPage = page
        val target = page * width
        scroller.abortAnimation()
        if (animate && width > 0) {
            val distance = target - scrollX
            val duration = (200 + abs(distance) * 250 / width).coerceAtMost(500)
            scroller.startScroll(scrollX, 0, distance, 0, duration)
            postInvalidateOnAnimation()
        } else {
            scrollTo(target, 0)
        }
        if (changed) onPageChanged?.invoke(page)
    }

    override fun computeScroll() {
        if (scroller.computeScrollOffset()) {
            scrollTo(scroller.currX, 0)
            postInvalidateOnAnimation()
        }
    }

    override fun onScrollChanged(l: Int, t: Int, oldl: Int, oldt: Int) {
        super.onScrollChanged(l, t, oldl, oldt)
        onScrolled?.invoke()
    }
}

/** Точки-индикатор экранов. */
class PageIndicator(context: Context) : View(context) {
    private var count = 1
    private var current = 0
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }

    fun set(count: Int, current: Int) {
        this.count = count
        this.current = current
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        if (count <= 1) return
        val radius = context.dp(3f)
        val spacing = context.dp(14f)
        var x = width / 2f - spacing * (count - 1) / 2f
        for (i in 0 until count) {
            paint.alpha = if (i == current) 255 else 110
            canvas.drawCircle(x, height / 2f, radius, paint)
            x += spacing
        }
    }
}

/** Всплывающее меню со скруглёнными углами в цветах темы. */
class LauncherPopup(private val context: Context, private val palette: Palette) {
    private val list = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        background = GradientDrawable().apply {
            cornerRadius = context.dp(22f)
            setColor(palette.container)
        }
        clipToOutline = true
        elevation = context.dp(6f)
        val pad = context.dpi(6)
        setPadding(0, pad, 0, pad)
    }
    private val frame = FrameLayout(context).apply {
        val pad = context.dpi(10)
        setPadding(pad, pad, pad, pad)
        clipToPadding = false
        addView(
            list,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
            )
        )
    }
    private var window: PopupWindow? = null

    fun add(label: CharSequence, action: () -> Unit) {
        val row = TextView(context).apply {
            text = label
            setTextColor(palette.onSurface)
            textSize = 15f
            typeface = Fonts.regular(context)
            gravity = Gravity.CENTER_VERTICAL
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            minWidth = context.dpi(210)
            maxWidth = context.dpi(280)
            minHeight = context.dpi(48)
            setPadding(context.dpi(22), 0, context.dpi(22), 0)
            background = RippleDrawable(
                ColorStateList.valueOf(0x33888888), null, ColorDrawable(Color.WHITE)
            )
            setOnClickListener {
                dismiss()
                action()
            }
        }
        list.addView(
            row,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
            )
        )
    }

    private fun create(): PopupWindow {
        val popup = PopupWindow(
            frame, ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, true
        )
        popup.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
        popup.isOutsideTouchable = true
        window = popup
        return popup
    }

    /** Показывает меню рядом с иконкой. */
    fun show(anchor: View) {
        try {
            create().showAsDropDown(anchor, 0, -anchor.height / 5)
        } catch (e: Exception) {
            window = null
        }
    }

    /** Показывает меню в точке касания. */
    fun showAt(parent: View, x: Int, y: Int) {
        try {
            create().showAtLocation(parent, Gravity.NO_GRAVITY, x, y)
        } catch (e: Exception) {
            window = null
        }
    }

    fun dismiss() {
        try {
            window?.dismiss()
        } catch (e: Exception) {
            // Окно уже закрыто.
        }
        window = null
    }
}
