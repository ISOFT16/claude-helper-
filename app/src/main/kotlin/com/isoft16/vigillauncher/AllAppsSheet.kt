package com.isoft16.vigillauncher

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.text.Editable
import android.text.InputType
import android.text.TextUtils
import android.text.TextWatcher
import android.view.Gravity
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.AbsListView
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.GridView
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.math.abs

/** Меню всех приложений: выезжает снизу, сверху строка поиска, ниже сетка по алфавиту. */
@SuppressLint("ViewConstructor")
class AllAppsSheet(
    context: Context,
    private val palette: Palette,
    private val host: Host,
) : LinearLayout(context) {

    interface Host {
        fun onSheetDrag(dy: Float)
        fun onSheetRelease(velocityY: Float)
        fun onAppClick(entry: AppEntry, view: View?)
        fun onAppLongClick(view: BubbleView): Boolean
        fun onWebSearch(query: String)
    }

    private val search = EditText(context)
    private val webRow = TextView(context)
    private val grid = GridView(context)
    private var all: List<AppEntry> = emptyList()
    private var shown: List<AppEntry> = emptyList()

    private val slop = ViewConfiguration.get(context).scaledTouchSlop
    private var downRawX = 0f
    private var downRawY = 0f
    private var downAboveGrid = false
    private var dragging = false
    private var tracker: VelocityTracker? = null

    private val adapter = object : BaseAdapter() {
        override fun getCount(): Int = shown.size
        override fun getItem(position: Int): Any = shown[position]
        override fun getItemId(position: Int): Long = position.toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
            val view = (convertView as? BubbleView) ?: BubbleView(context).apply {
                layoutParams = AbsListView.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, context.dpi(96)
                )
                setOnClickListener { v ->
                    (v as BubbleView).entry?.let { host.onAppClick(it, v) }
                }
                setOnLongClickListener { v -> host.onAppLongClick(v as BubbleView) }
            }
            view.alpha = 1f
            view.bind(shown[position], null, true, palette.onSurface, false)
            return view
        }
    }

    init {
        orientation = VERTICAL
        val corner = context.dp(28f)
        background = GradientDrawable().apply {
            setColor(palette.surface)
            cornerRadii = floatArrayOf(corner, corner, corner, corner, 0f, 0f, 0f, 0f)
        }

        search.apply {
            background = GradientDrawable().apply {
                cornerRadius = context.dp(28f)
                setColor(palette.container)
            }
            hint = context.getString(R.string.search_apps)
            setHintTextColor(palette.onSurfaceVariant)
            setTextColor(palette.onSurface)
            textSize = 16f
            typeface = Fonts.regular(context)
            setSingleLine(true)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            imeOptions = EditorInfo.IME_ACTION_SEARCH or EditorInfo.IME_FLAG_NO_EXTRACT_UI
            gravity = Gravity.CENTER_VERTICAL
            val icon = context.getDrawable(R.drawable.ic_search)?.mutate()
            icon?.setTint(palette.onSurfaceVariant)
            setCompoundDrawablesRelativeWithIntrinsicBounds(icon, null, null, null)
            compoundDrawablePadding = context.dpi(12)
            setPadding(context.dpi(18), 0, context.dpi(18), 0)
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun afterTextChanged(s: Editable?) = applyFilter()
            })
            setOnEditorActionListener { _, actionId, _ ->
                if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                    val query = text.toString().trim()
                    val first = shown.firstOrNull()
                    if (query.isNotEmpty() && first != null) {
                        host.onAppClick(first, null)
                    } else if (query.isNotEmpty()) {
                        host.onWebSearch(query)
                    }
                    true
                } else {
                    false
                }
            }
        }
        addView(
            search,
            LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, context.dpi(54)).apply {
                setMargins(context.dpi(16), context.dpi(14), context.dpi(16), context.dpi(8))
            }
        )

        webRow.apply {
            visibility = View.GONE
            setTextColor(palette.accent)
            textSize = 15f
            typeface = Fonts.medium(context)
            gravity = Gravity.CENTER_VERTICAL
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            setPadding(context.dpi(36), 0, context.dpi(24), 0)
            background = RippleDrawable(
                ColorStateList.valueOf(0x33888888), null, ColorDrawable(Color.WHITE)
            )
            setOnClickListener {
                val query = search.text.toString().trim()
                if (query.isNotEmpty()) host.onWebSearch(query)
            }
        }
        addView(webRow, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, context.dpi(48)))

        grid.apply {
            numColumns = 4
            stretchMode = GridView.STRETCH_COLUMN_WIDTH
            selector = ColorDrawable(Color.TRANSPARENT)
            isVerticalScrollBarEnabled = false
            clipToPadding = false
            setPadding(context.dpi(8), context.dpi(4), context.dpi(8), 0)
            adapter = this@AllAppsSheet.adapter
        }
        addView(grid, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    }

    fun setApps(apps: List<AppEntry>) {
        all = apps
        applyFilter()
    }

    fun setColumns(columns: Int) {
        grid.numColumns = columns
    }

    /** Отступы под строку состояния и под панель навигации или клавиатуру. */
    fun setInsets(top: Int, bottom: Int) {
        setPadding(0, top, 0, 0)
        grid.setPadding(grid.paddingLeft, grid.paddingTop, grid.paddingRight, bottom)
    }

    /** Сбрасывает поиск и прокрутку, когда меню закрывается. */
    fun reset() {
        if (search.text.isNotEmpty()) search.setText("")
        search.clearFocus()
        grid.setSelection(0)
    }

    fun focusSearch() {
        search.requestFocus()
        val imm = context.getSystemService(InputMethodManager::class.java)
        imm?.showSoftInput(search, InputMethodManager.SHOW_IMPLICIT)
    }

    private fun applyFilter() {
        val query = search.text.toString().trim()
        if (query.isEmpty()) {
            shown = all
            webRow.visibility = View.GONE
        } else {
            val starts = ArrayList<AppEntry>()
            val contains = ArrayList<AppEntry>()
            for (app in all) {
                when {
                    app.label.startsWith(query, ignoreCase = true) -> starts.add(app)
                    app.label.contains(query, ignoreCase = true) -> contains.add(app)
                }
            }
            shown = starts + contains
            webRow.text = context.getString(R.string.web_search, query)
            webRow.visibility = View.VISIBLE
        }
        adapter.notifyDataSetChanged()
    }

    // Жест «потянуть вниз, чтобы закрыть»: работает, когда список прокручен до верха.

    private fun begin(ev: MotionEvent) {
        downRawX = ev.rawX
        downRawY = ev.rawY
        downAboveGrid = ev.y < grid.top
        dragging = false
        tracker?.recycle()
        tracker = VelocityTracker.obtain()
        track(ev)
    }

    /** Панель двигается вместе с пальцем, поэтому скорость считается в неподвижных координатах. */
    private fun track(ev: MotionEvent) {
        val copy = MotionEvent.obtain(ev)
        copy.offsetLocation(0f, translationY)
        tracker?.addMovement(copy)
        copy.recycle()
    }

    private fun move(ev: MotionEvent) {
        track(ev)
        val dx = ev.rawX - downRawX
        val dy = ev.rawY - downRawY
        if (!dragging && dy > slop && dy > abs(dx) &&
            (downAboveGrid || !grid.canScrollVertically(-1))
        ) {
            dragging = true
        }
        if (dragging) host.onSheetDrag(dy)
    }

    private fun finish(cancelled: Boolean) {
        var vy = 0f
        tracker?.let {
            it.computeCurrentVelocity(1000)
            vy = it.yVelocity
            it.recycle()
        }
        tracker = null
        if (dragging) host.onSheetRelease(if (cancelled) 0f else vy)
        dragging = false
    }

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> begin(ev)
            MotionEvent.ACTION_MOVE -> {
                move(ev)
                return dragging
            }
            MotionEvent.ACTION_UP -> finish(false)
            MotionEvent.ACTION_CANCEL -> finish(true)
        }
        return false
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(ev: MotionEvent): Boolean {
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> begin(ev)
            MotionEvent.ACTION_MOVE -> move(ev)
            MotionEvent.ACTION_UP -> finish(false)
            MotionEvent.ACTION_CANCEL -> finish(true)
        }
        return true
    }
}
