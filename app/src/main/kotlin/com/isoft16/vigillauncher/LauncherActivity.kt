package com.isoft16.vigillauncher

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Activity
import android.app.ActivityOptions
import android.app.SearchManager
import android.app.WallpaperManager
import android.app.role.RoleManager
import android.content.ClipData
import android.content.ContentUris
import android.content.Intent
import android.content.pm.LauncherApps
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.CalendarContract
import android.provider.Settings
import android.text.format.DateFormat
import android.view.DragEvent
import android.view.Gravity
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.view.inputmethod.InputMethodManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextClock
import android.widget.TextView
import android.widget.Toast
import java.util.Locale
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

class LauncherActivity : Activity(), HomeRoot.Host, AllAppsSheet.Host {

    /** Что именно сейчас перетаскивается. */
    private class DragInfo(val entry: AppEntry, val item: HomeItem?, val source: View)

    /** Ячейка, над которой находится палец при перетаскивании. */
    private class DropTarget(
        val container: Int,
        val page: Int,
        val x: Int,
        val y: Int,
        val layout: CellLayout,
    )

    private lateinit var palette: Palette
    private lateinit var repo: AppRepository
    private lateinit var store: HomeStore
    private lateinit var launcherApps: LauncherApps

    private lateinit var root: HomeRoot
    private lateinit var homeContent: LinearLayout
    private lateinit var workspace: Workspace
    private lateinit var indicator: PageIndicator
    private lateinit var dockHolder: FrameLayout
    private lateinit var dock: CellLayout
    private lateinit var glance: TextClock
    private lateinit var banner: TextView
    private lateinit var sheet: AllAppsSheet

    private val handler = Handler(Looper.getMainLooper())
    private var cols = 4
    private var progress = 0f
    private var drawerAnimator: ValueAnimator? = null
    private var popup: LauncherPopup? = null

    private var dragOriginSet = false
    private var dragMoved = false
    private var dragOriginX = 0f
    private var dragOriginY = 0f
    private var highlighted: CellLayout? = null
    private var edgeDirection = 0
    private val edgeScroll = Runnable {
        val next = workspace.currentPage + edgeDirection
        edgeDirection = 0
        if (next in 0 until workspace.pageCount) workspace.snapToPage(next, true)
    }

    // ---------------------------------------------------------------- запуск

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        palette = Palette(this)
        store = HomeStore(this)
        store.load()
        cols = Prefs.columns(this)
        store.normalize(cols, GRID_ROWS)
        launcherApps = getSystemService(LauncherApps::class.java)

        setupWindow()
        buildViews()
        setContentView(root)

        repo = AppRepository(this)
        repo.listener = { onAppsLoaded() }
        repo.start()
        bindHome()
    }

    override fun onDestroy() {
        super.onDestroy()
        popup?.dismiss()
        drawerAnimator?.cancel()
        handler.removeCallbacksAndMessages(null)
        repo.listener = null
        repo.stop()
    }

    override fun onResume() {
        super.onResume()
        banner.visibility = if (isDefaultHome()) View.GONE else View.VISIBLE
    }

    /** Кнопка «Домой», когда лаунчер уже открыт: закрыть меню или вернуться на первый экран. */
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        popup?.dismiss()
        if (progress > 0f) {
            animateDrawer(false)
        } else {
            workspace.snapToPage(0, true)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Лаунчер не закрывается кнопкой «Назад» — она только прячет меню приложений.
        if (progress > 0f) animateDrawer(false)
    }

    @Suppress("DEPRECATION")
    private fun setupWindow() {
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= 28) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        if (Build.VERSION.SDK_INT >= 29) {
            window.isNavigationBarContrastEnforced = false
            window.isStatusBarContrastEnforced = false
        }
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
        } else {
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        }
    }

    // ---------------------------------------------------------------- построение экрана

    private fun buildViews() {
        root = HomeRoot(this)
        root.host = this
        root.isFocusableInTouchMode = true

        homeContent = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        workspace = Workspace(this)
        workspace.onPageChanged = { page -> indicator.set(workspace.pageCount, page) }
        workspace.onScrolled = { updateWallpaperOffset() }
        homeContent.addView(
            workspace, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
        )

        indicator = PageIndicator(this)
        homeContent.addView(
            indicator, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dpi(18))
        )

        dockHolder = FrameLayout(this)
        dock = CellLayout(this, cols, 1)
        dockHolder.addView(dock)
        homeContent.addView(
            dockHolder, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dpi(84))
        )

        homeContent.addView(
            buildSearchPill(),
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dpi(52)).apply {
                setMargins(dpi(20), dpi(6), dpi(20), dpi(14))
            }
        )
        root.addView(homeContent, matchParent())

        glance = buildGlance()

        banner = TextView(this).apply {
            text = getString(R.string.set_default_banner)
            setTextColor(palette.onSurface)
            textSize = 14f
            typeface = Fonts.medium(this@LauncherActivity)
            gravity = Gravity.CENTER
            setPadding(dpi(22), 0, dpi(22), 0)
            background = GradientDrawable().apply {
                cornerRadius = dp(24f)
                setColor(palette.pill)
            }
            elevation = dp(4f)
            visibility = View.GONE
            setOnClickListener { requestDefaultHome() }
        }
        root.addView(
            banner,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dpi(48)).apply {
                gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
                bottomMargin = dpi(230)
            }
        )

        sheet = AllAppsSheet(this, palette, this)
        sheet.setColumns(cols)
        sheet.visibility = View.INVISIBLE
        root.addView(sheet, matchParent())

        root.setOnApplyWindowInsetsListener { _, insets ->
            applyInsets(insets)
            insets
        }
        root.addOnLayoutChangeListener { _, _, top, _, bottom, _, oldTop, _, oldBottom ->
            if (bottom - top != oldBottom - oldTop) setProgress(progress)
        }
        root.setOnDragListener { _, event -> onDrag(event) }
    }

    private fun matchParent() = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
    )

    @Suppress("DEPRECATION")
    private fun applyInsets(insets: WindowInsets) {
        val top: Int
        val bottom: Int
        val keyboard: Int
        if (Build.VERSION.SDK_INT >= 30) {
            val bars = insets.getInsets(
                WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()
            )
            top = bars.top
            bottom = bars.bottom
            keyboard = insets.getInsets(WindowInsets.Type.ime()).bottom
        } else {
            top = insets.systemWindowInsetTop
            // На старых версиях клавиатура приходит тем же отступом, что и панель навигации.
            val raw = insets.systemWindowInsetBottom
            bottom = if (raw > dpi(120)) insets.stableInsetBottom else raw
            keyboard = raw
        }
        homeContent.setPadding(0, top, 0, bottom)
        sheet.setInsets(top, max(bottom, keyboard))
    }

    /** Дата в левом верхнем углу первого экрана, как «Самое главное» в Pixel. */
    private fun buildGlance(): TextClock {
        val pattern = DateFormat.getBestDateTimePattern(Locale.getDefault(), "EEEMMMMd")
        return TextClock(this).apply {
            format12Hour = pattern
            format24Hour = pattern
            setTextColor(Color.WHITE)
            textSize = 22f
            typeface = Fonts.regular(this@LauncherActivity)
            setShadowLayer(dp(4f), 0f, dp(1f), 0x99000000.toInt())
            gravity = Gravity.CENTER_VERTICAL or Gravity.START
            setPadding(dpi(26), 0, dpi(26), 0)
            setOnClickListener { openCalendar() }
        }
    }

    private fun buildSearchPill(): View {
        val pill = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dpi(18), 0, dpi(18), 0)
            background = GradientDrawable().apply {
                cornerRadius = dp(28f)
                setColor(palette.pill)
            }
            setOnClickListener { animateDrawer(true, focusSearch = true) }
        }
        val icon = ImageView(this).apply {
            setImageResource(R.drawable.ic_search)
            setColorFilter(palette.accent)
        }
        pill.addView(icon, LinearLayout.LayoutParams(dpi(24), dpi(24)))
        val hint = TextView(this).apply {
            text = getString(R.string.search_hint)
            setTextColor(palette.onSurfaceVariant)
            textSize = 16f
            typeface = Fonts.regular(this@LauncherActivity)
        }
        pill.addView(
            hint,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { marginStart = dpi(12) }
        )
        return pill
    }

    // ---------------------------------------------------------------- приложения и раскладка

    private fun onAppsLoaded() {
        if (!store.initialized) {
            store.populateDefaults(repo.apps, cols, GRID_ROWS)
        } else if (store.prune(repo.byKey.keys)) {
            store.compactPages()
            store.save()
        }
        sheet.setApps(repo.apps)
        bindHome()
    }

    /** Заново расставляет ярлыки на экранах и в доке по сохранённой раскладке. */
    private fun bindHome() {
        (glance.parent as? ViewGroup)?.removeView(glance)
        workspace.removeAllViews()
        val pages = store.pageCount()
        for (page in 0 until pages) {
            val layout = CellLayout(this, cols, GRID_ROWS)
            layout.setPadding(dpi(8), dpi(4), dpi(8), 0)
            if (page == 0) layout.addItem(glance, 0, 0, cols, 1)
            workspace.addView(layout)
        }

        dockHolder.removeAllViews()
        dock = CellLayout(this, cols, 1)
        dock.setPadding(dpi(8), 0, dpi(8), 0)
        dockHolder.addView(dock, matchParent())

        for (item in store.items) {
            val entry = repo.byKey[item.key] ?: continue
            val view = BubbleView(this)
            val onDesktop = item.container == HomeStore.DESKTOP
            view.bind(entry, item, onDesktop, Color.WHITE, true)
            view.setOnClickListener { launch(entry, view) }
            view.setOnLongClickListener { startAppDrag(view) }
            if (onDesktop) {
                if (item.page < pages) workspace.page(item.page).addItem(view, item.x, item.y)
            } else {
                dock.addItem(view, item.x, 0)
            }
        }
        highlighted = null
        workspace.snapToPage(min(workspace.currentPage, pages - 1), false)
        indicator.set(pages, workspace.currentPage)
        updateWallpaperOffset()
    }

    private fun updateWallpaperOffset() {
        val token = root.windowToken ?: return
        val pages = workspace.pageCount
        val width = workspace.width
        if (width == 0) return
        try {
            val manager = WallpaperManager.getInstance(this)
            if (pages <= 1) {
                manager.setWallpaperOffsets(token, 0f, 0.5f)
            } else {
                val span = ((pages - 1) * width).toFloat()
                manager.setWallpaperOffsetSteps(1f / (pages - 1), 1f)
                manager.setWallpaperOffsets(
                    token, (workspace.scrollX / span).coerceIn(0f, 1f), 0.5f
                )
            }
        } catch (e: Exception) {
            // Обои не обязаны поддерживать прокрутку.
        }
    }

    private fun launch(entry: AppEntry, view: View?) {
        try {
            var bounds: Rect? = null
            var options: Bundle? = null
            if (view != null && view.isAttachedToWindow) {
                bounds = Rect().also { view.getGlobalVisibleRect(it) }
                options = ActivityOptions
                    .makeScaleUpAnimation(view, 0, 0, view.width, view.height)
                    .toBundle()
            }
            launcherApps.startMainActivity(entry.component, entry.user, bounds, options)
        } catch (e: Exception) {
            toast(R.string.cannot_open)
        }
    }

    private fun toast(textId: Int) {
        Toast.makeText(this, textId, Toast.LENGTH_SHORT).show()
    }

    // ---------------------------------------------------------------- меню приложений

    private fun setProgress(value: Float) {
        val p = value.coerceIn(0f, 1f)
        val previous = progress
        progress = p
        val height = root.height.toFloat()
        sheet.translationY = (1f - p) * height
        sheet.visibility = if (p > 0f && height > 0f) View.VISIBLE else View.INVISIBLE
        homeContent.alpha = 1f - min(1f, p * 1.6f)
        val scale = 1f - 0.06f * p
        homeContent.scaleX = scale
        homeContent.scaleY = scale
        if (p == 0f && previous > 0f) {
            sheet.reset()
            hideKeyboard()
        }
        if ((p == 1f) != (previous == 1f)) updateSystemBars()
    }

    private fun animateDrawer(open: Boolean, focusSearch: Boolean = false) {
        drawerAnimator?.cancel()
        val animator = ValueAnimator.ofFloat(progress, if (open) 1f else 0f)
        animator.duration = 300
        animator.interpolator = DecelerateInterpolator(1.8f)
        animator.addUpdateListener { setProgress(it.animatedValue as Float) }
        animator.addListener(object : AnimatorListenerAdapter() {
            private var cancelled = false
            override fun onAnimationCancel(animation: Animator) {
                cancelled = true
            }

            override fun onAnimationEnd(animation: Animator) {
                if (!cancelled && open && focusSearch) sheet.focusSearch()
            }
        })
        drawerAnimator = animator
        animator.start()
    }

    /** В светлой теме у открытого меню светлый фон, поэтому значки строки состояния темнеют. */
    @Suppress("DEPRECATION")
    private fun updateSystemBars() {
        val light = progress == 1f && !palette.dark
        if (Build.VERSION.SDK_INT >= 30) {
            val mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(if (light) mask else 0, mask)
        } else {
            var flags = window.decorView.systemUiVisibility
            val mask = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or
                View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            flags = if (light) flags or mask else flags and mask.inv()
            window.decorView.systemUiVisibility = flags
        }
    }

    private fun hideKeyboard() {
        val imm = getSystemService(InputMethodManager::class.java)
        imm?.hideSoftInputFromWindow(root.windowToken, 0)
    }

    // ---------------------------------------------------------------- жесты главного экрана

    override fun drawerProgress(): Float = progress

    override fun workspace(): Workspace = workspace

    override fun onDrawerDrag(dy: Float) {
        drawerAnimator?.cancel()
        val height = root.height.toFloat()
        if (height > 0f) setProgress(-dy / height * 1.25f)
    }

    override fun onDrawerRelease(velocityY: Float) {
        val fling = dp(600f)
        val open = velocityY < -fling || (progress > 0.3f && velocityY < fling)
        animateDrawer(open)
    }

    @SuppressLint("WrongConstant", "PrivateApi")
    override fun onSwipeDown() {
        try {
            val service = getSystemService("statusbar")
            Class.forName("android.app.StatusBarManager")
                .getMethod("expandNotificationsPanel")
                .invoke(service)
        } catch (e: Exception) {
            // На некоторых прошивках шторку так открыть нельзя.
        }
    }

    override fun onEmptyLongPress(x: Float, y: Float) {
        popup?.dismiss()
        val menu = LauncherPopup(this, palette)
        menu.add(getString(R.string.wallpaper)) { openWallpaperPicker() }
        menu.add(getString(R.string.home_settings)) { showSettings(x, y) }
        menu.showAt(root, x.toInt(), y.toInt())
        popup = menu
    }

    private fun showSettings(x: Float, y: Float) {
        popup?.dismiss()
        val menu = LauncherPopup(this, palette)
        val themed = Prefs.themedIcons(this)
        menu.add(
            getString(if (themed) R.string.themed_icons_on else R.string.themed_icons_off)
        ) {
            Prefs.setThemedIcons(this, !themed)
            repo.reload()
        }
        menu.add(getString(R.string.grid_columns, cols)) {
            cols = if (cols == 4) 5 else 4
            Prefs.setColumns(this, cols)
            store.normalize(cols, GRID_ROWS)
            store.save()
            sheet.setColumns(cols)
            bindHome()
        }
        menu.add(getString(R.string.set_default)) { requestDefaultHome() }
        menu.showAt(root, x.toInt(), y.toInt())
        popup = menu
    }

    // ---------------------------------------------------------------- жесты меню приложений

    override fun onSheetDrag(dy: Float) {
        drawerAnimator?.cancel()
        val height = root.height.toFloat()
        if (height > 0f) setProgress(1f - dy / height)
    }

    override fun onSheetRelease(velocityY: Float) {
        val fling = dp(600f)
        val close = velocityY > fling || (progress < 0.75f && velocityY > -fling)
        animateDrawer(!close)
    }

    override fun onAppClick(entry: AppEntry, view: View?) = launch(entry, view)

    override fun onAppLongClick(view: BubbleView): Boolean = startAppDrag(view)

    override fun onWebSearch(query: String) {
        try {
            startActivity(
                Intent(Intent.ACTION_WEB_SEARCH)
                    .putExtra(SearchManager.QUERY, query)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        } catch (e: Exception) {
            try {
                startActivity(
                    Intent(
                        Intent.ACTION_VIEW,
                        Uri.parse("https://www.google.com/search?q=" + Uri.encode(query))
                    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } catch (e2: Exception) {
                toast(R.string.cannot_open)
            }
        }
    }

    // ---------------------------------------------------------------- меню иконки

    private fun showAppPopup(anchor: View, entry: AppEntry, item: HomeItem?) {
        popup?.dismiss()
        val menu = LauncherPopup(this, palette)
        addShortcuts(menu, entry)
        menu.add(getString(R.string.app_info)) {
            try {
                launcherApps.startAppDetailsActivity(entry.component, entry.user, null, null)
            } catch (e: Exception) {
                toast(R.string.cannot_open)
            }
        }
        if (!entry.isSystem) {
            menu.add(getString(R.string.uninstall)) {
                try {
                    startActivity(
                        Intent(
                            Intent.ACTION_DELETE,
                            Uri.parse("package:" + entry.component.packageName)
                        )
                    )
                } catch (e: Exception) {
                    toast(R.string.cannot_open)
                }
            }
        }
        if (item != null) {
            menu.add(getString(R.string.remove_from_home)) {
                store.items.remove(item)
                store.compactPages()
                store.save()
                bindHome()
            }
        } else {
            menu.add(getString(R.string.add_to_home)) { addToHome(entry) }
        }
        menu.show(anchor)
        popup = menu
    }

    /** Быстрые действия приложения. Доступны, только когда лаунчер выбран по умолчанию. */
    private fun addShortcuts(menu: LauncherPopup, entry: AppEntry) {
        try {
            if (!launcherApps.hasShortcutHostPermission()) return
            val query = LauncherApps.ShortcutQuery()
                .setPackage(entry.component.packageName)
                .setActivity(entry.component)
                .setQueryFlags(
                    LauncherApps.ShortcutQuery.FLAG_MATCH_DYNAMIC or
                        LauncherApps.ShortcutQuery.FLAG_MATCH_MANIFEST
                )
            val shortcuts = launcherApps.getShortcuts(query, entry.user) ?: return
            for (shortcut in shortcuts.sortedBy { it.rank }.take(4)) {
                val label = shortcut.shortLabel ?: shortcut.longLabel ?: continue
                menu.add(label) {
                    try {
                        launcherApps.startShortcut(shortcut, null, null)
                    } catch (e: Exception) {
                        toast(R.string.cannot_open)
                    }
                }
            }
        } catch (e: Exception) {
            // Нет доступа к быстрым действиям — показываем меню без них.
        }
    }

    private fun addToHome(entry: AppEntry) {
        val cell = store.firstFreeDesktop(workspace.currentPage, cols, GRID_ROWS)
        store.items.add(HomeItem(entry.key, HomeStore.DESKTOP, cell[0], cell[1], cell[2]))
        store.save()
        bindHome()
        workspace.snapToPage(cell[0], false)
        indicator.set(workspace.pageCount, workspace.currentPage)
        if (progress > 0f) animateDrawer(false)
    }

    // ---------------------------------------------------------------- перетаскивание

    /** Долгое нажатие на иконку: показывает меню и одновременно начинает перетаскивание. */
    private fun startAppDrag(view: BubbleView): Boolean {
        val entry = view.entry ?: return false
        showAppPopup(view, entry, view.homeItem)
        try {
            view.startDragAndDrop(
                ClipData.newPlainText("app", entry.key),
                View.DragShadowBuilder(view),
                DragInfo(entry, view.homeItem, view),
                0,
            )
        } catch (e: Exception) {
            // Меню уже показано; без перетаскивания можно обойтись.
        }
        return true
    }

    private fun onDrag(event: DragEvent): Boolean {
        val info = event.localState as? DragInfo ?: return false
        when (event.action) {
            DragEvent.ACTION_DRAG_STARTED -> {
                dragOriginSet = false
                dragMoved = false
                info.source.alpha = 0.35f
            }

            DragEvent.ACTION_DRAG_LOCATION -> {
                if (!dragOriginSet) {
                    dragOriginSet = true
                    dragOriginX = event.x
                    dragOriginY = event.y
                }
                if (!dragMoved) {
                    val slop = ViewConfiguration.get(this).scaledTouchSlop * 1.5f
                    if (hypot(event.x - dragOriginX, event.y - dragOriginY) > slop) {
                        dragMoved = true
                        popup?.dismiss()
                        if (progress > 0f) animateDrawer(false)
                        addSparePage()
                    }
                }
                if (dragMoved) updateDragTarget(event.x, event.y)
            }

            DragEvent.ACTION_DROP -> {
                if (dragMoved) {
                    val target = targetAt(event.x, event.y)
                    if (target != null) handleDrop(info, target)
                }
            }

            DragEvent.ACTION_DRAG_ENDED -> {
                info.source.alpha = 1f
                highlighted?.clearHighlight()
                highlighted = null
                handler.removeCallbacks(edgeScroll)
                edgeDirection = 0
                if (dragMoved) {
                    dragMoved = false
                    bindHome()
                }
            }
        }
        return true
    }

    /** Пока иконку тащат, справа появляется пустой экран, чтобы её можно было туда положить. */
    private fun addSparePage() {
        val last = workspace.pageCount - 1
        val lastHasItems = store.items.any {
            it.container == HomeStore.DESKTOP && it.page == last
        }
        if (!lastHasItems) return
        val layout = CellLayout(this, cols, GRID_ROWS)
        layout.setPadding(dpi(8), dpi(4), dpi(8), 0)
        workspace.addView(layout)
        indicator.set(workspace.pageCount, workspace.currentPage)
    }

    private fun boundsInRoot(view: View): Rect {
        val a = IntArray(2)
        val b = IntArray(2)
        view.getLocationInWindow(a)
        root.getLocationInWindow(b)
        val left = a[0] - b[0]
        val top = a[1] - b[1]
        return Rect(left, top, left + view.width, top + view.height)
    }

    private fun targetAt(x: Float, y: Float): DropTarget? {
        val dockBounds = boundsInRoot(dockHolder)
        if (dockBounds.contains(x.toInt(), y.toInt())) {
            val cell = dock.cellAt(x - dockBounds.left, y - dockBounds.top)
            return DropTarget(HomeStore.DOCK, 0, cell[0], 0, dock)
        }
        val area = boundsInRoot(workspace)
        if (area.contains(x.toInt(), y.toInt()) && workspace.pageCount > 0) {
            val page = workspace.currentPage
            val layout = workspace.page(page)
            val cell = layout.cellAt(x - area.left, y - area.top)
            return DropTarget(HomeStore.DESKTOP, page, cell[0], cell[1], layout)
        }
        return null
    }

    private fun updateDragTarget(x: Float, y: Float) {
        val target = targetAt(x, y)
        if (highlighted != target?.layout) highlighted?.clearHighlight()
        highlighted = target?.layout
        target?.layout?.setHighlight(target.x, target.y)

        // У края экрана иконка перелистывает на соседний экран.
        val edge = dp(28f)
        val direction = when {
            target?.container != HomeStore.DESKTOP -> 0
            x < edge -> -1
            x > root.width - edge -> 1
            else -> 0
        }
        if (direction != edgeDirection) {
            handler.removeCallbacks(edgeScroll)
            edgeDirection = direction
            if (direction != 0) handler.postDelayed(edgeScroll, 650)
        }
    }

    private fun handleDrop(info: DragInfo, target: DropTarget) {
        val source = info.item
        val existing = store.itemAt(target.container, target.page, target.x, target.y)
        val free = store.isFree(
            target.container, target.page, target.x, target.y, cols, GRID_ROWS
        )
        if (source != null) {
            if (existing === source) return
            if (existing != null) {
                // Ячейка занята: ярлыки меняются местами.
                existing.container = source.container
                existing.page = source.page
                existing.x = source.x
                existing.y = source.y
            } else if (!free) {
                return
            }
            source.container = target.container
            source.page = target.page
            source.x = target.x
            source.y = target.y
        } else {
            var x = target.x
            var y = target.y
            if (!free) {
                val cell = store.nearestFree(
                    target.container, target.page, x, y, cols, GRID_ROWS
                )
                if (cell == null) {
                    toast(R.string.no_room)
                    return
                }
                x = cell[0]
                y = cell[1]
            }
            store.items.add(HomeItem(info.entry.key, target.container, target.page, x, y))
        }
        store.compactPages()
        store.save()
    }

    // ---------------------------------------------------------------- системные экраны

    private fun openCalendar() {
        try {
            val uri = ContentUris.withAppendedId(
                CalendarContract.CONTENT_URI.buildUpon().appendPath("time").build(),
                System.currentTimeMillis()
            )
            startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (e: Exception) {
            // Календарь не установлен.
        }
    }

    private fun openWallpaperPicker() {
        try {
            startActivity(
                Intent.createChooser(
                    Intent(Intent.ACTION_SET_WALLPAPER), getString(R.string.wallpaper)
                )
            )
        } catch (e: Exception) {
            toast(R.string.cannot_open)
        }
    }

    private fun isDefaultHome(): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= 29) {
                val roles = getSystemService(RoleManager::class.java)
                if (roles != null && roles.isRoleAvailable(RoleManager.ROLE_HOME)) {
                    return roles.isRoleHeld(RoleManager.ROLE_HOME)
                }
            }
            val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
            val resolved = packageManager.resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY)
            resolved?.activityInfo?.packageName == packageName
        } catch (e: Exception) {
            true
        }
    }

    private fun requestDefaultHome() {
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                val roles = getSystemService(RoleManager::class.java)
                if (roles != null && roles.isRoleAvailable(RoleManager.ROLE_HOME) &&
                    !roles.isRoleHeld(RoleManager.ROLE_HOME)
                ) {
                    startActivityForResult(
                        roles.createRequestRoleIntent(RoleManager.ROLE_HOME), 1
                    )
                    return
                }
            }
            startActivity(Intent(Settings.ACTION_HOME_SETTINGS))
        } catch (e: Exception) {
            toast(R.string.cannot_open)
        }
    }
}
