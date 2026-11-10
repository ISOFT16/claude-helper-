package com.isoft16.vigillauncher

import android.app.Activity
import android.app.AlertDialog
import android.app.role.RoleManager
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsetsController
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast

/** Экран настроек лаунчера: значки, сетка, анимации. */
class SettingsActivity : Activity() {
    private lateinit var palette: Palette
    private lateinit var list: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        palette = Palette(this)
        window.decorView.setBackgroundColor(palette.surface)
        setupBars()

        list = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dpi(8), 0, dpi(32))
        }
        val scroll = ScrollView(this).apply {
            fitsSystemWindows = true
            clipToPadding = false
            addView(
                list,
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
                )
            )
        }
        setContentView(scroll)
    }

    override fun onResume() {
        super.onResume()
        // Список наборов значков мог измениться, пока экран был скрыт.
        rebuild()
    }

    @Suppress("DEPRECATION")
    private fun setupBars() {
        window.statusBarColor = palette.surface
        window.navigationBarColor = palette.surface
        if (Build.VERSION.SDK_INT >= 30) {
            val mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(if (palette.dark) 0 else mask, mask)
        } else if (!palette.dark) {
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        }
    }

    // ---------------------------------------------------------------- содержимое

    private fun rebuild() {
        list.removeAllViews()

        list.addView(TextView(this).apply {
            text = getString(R.string.settings_title)
            setTextColor(palette.onSurface)
            textSize = 30f
            typeface = Fonts.regular(this@SettingsActivity)
            setPadding(dpi(24), dpi(40), dpi(24), dpi(20))
        })

        // Значки
        header(R.string.section_icons)
        val packs = IconPack.installed(this)
        val currentPack = Prefs.iconPack(this)
        val packSummary = when {
            currentPack.isEmpty() && packs.isEmpty() -> getString(R.string.icon_pack_none)
            currentPack.isEmpty() -> getString(R.string.icon_pack_system)
            else -> packs.firstOrNull { it.first == currentPack }?.second
                ?: getString(R.string.icon_pack_missing)
        }
        row(getString(R.string.icon_pack), packSummary) {
            val labels = listOf(getString(R.string.icon_pack_system)) + packs.map { it.second }
            val values = listOf("") + packs.map { it.first }
            choose(R.string.icon_pack, labels, values.indexOf(currentPack)) {
                Prefs.setIconPack(this, values[it])
            }
        }

        val shapes = listOf(
            R.string.shape_circle, R.string.shape_squircle,
            R.string.shape_rounded, R.string.shape_square,
        ).map { getString(it) }
        val shape = Prefs.iconShape(this).coerceIn(0, shapes.size - 1)
        row(getString(R.string.icon_shape), shapes[shape]) {
            choose(R.string.icon_shape, shapes, shape) { Prefs.setIconShape(this, it) }
        }

        val themed = Prefs.themedIcons(this)
        toggle(
            getString(R.string.themed_icons), getString(R.string.themed_icons_summary), themed
        ) { Prefs.setThemedIcons(this, it) }
        if (themed) {
            toggle(
                getString(R.string.themed_all), getString(R.string.themed_all_summary),
                Prefs.themedAll(this)
            ) { Prefs.setThemedAll(this, it) }
        }

        val sizes = listOf(R.string.size_small, R.string.size_medium, R.string.size_large)
            .map { getString(it) }
        val sizeValues = listOf(50, 58, 66)
        val sizeIndex = sizeValues.indexOf(Prefs.iconSizeDp(this)).coerceAtLeast(0)
        row(getString(R.string.icon_size), sizes[sizeIndex]) {
            choose(R.string.icon_size, sizes, sizeIndex) {
                Prefs.setIconSizeDp(this, sizeValues[it])
            }
        }

        // Главный экран
        header(R.string.section_grid)
        val columns = Prefs.columns(this)
        row(getString(R.string.grid_columns_title), columns.toString()) {
            choose(R.string.grid_columns_title, listOf("4", "5"), columns - 4) {
                Prefs.setColumns(this, it + 4)
            }
        }
        val rowCount = Prefs.rows(this)
        row(getString(R.string.grid_rows_title), rowCount.toString()) {
            choose(R.string.grid_rows_title, listOf("5", "6"), rowCount - 5) {
                Prefs.setRows(this, it + 5)
            }
        }
        toggle(getString(R.string.home_labels), null, Prefs.homeLabels(this)) {
            Prefs.setHomeLabels(this, it)
        }

        toggle(
            getString(R.string.hide_nav), getString(R.string.hide_nav_summary),
            Prefs.hideNavBar(this)
        ) { Prefs.setHideNavBar(this, it) }

        // Анимации
        header(R.string.section_motion)
        toggle(
            getString(R.string.animations), getString(R.string.animations_summary),
            Prefs.animations(this)
        ) { Prefs.setAnimations(this, it) }

        // Система
        header(R.string.section_system)
        row(getString(R.string.set_default), null) { requestDefaultHome() }
        row(getString(R.string.wallpaper), null) {
            try {
                startActivity(
                    Intent.createChooser(
                        Intent(Intent.ACTION_SET_WALLPAPER), getString(R.string.wallpaper)
                    )
                )
            } catch (e: Exception) {
                Toast.makeText(this, R.string.cannot_open, Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun header(textId: Int) {
        list.addView(TextView(this).apply {
            text = getString(textId)
            setTextColor(palette.accent)
            textSize = 14f
            typeface = Fonts.medium(this@SettingsActivity)
            setPadding(dpi(24), dpi(24), dpi(24), dpi(8))
        })
    }

    private fun texts(title: String, summary: String?): LinearLayout {
        val column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        column.addView(TextView(this).apply {
            text = title
            setTextColor(palette.onSurface)
            textSize = 17f
            typeface = Fonts.regular(this@SettingsActivity)
        })
        if (!summary.isNullOrEmpty()) {
            column.addView(TextView(this).apply {
                text = summary
                setTextColor(palette.onSurfaceVariant)
                textSize = 14f
                typeface = Fonts.regular(this@SettingsActivity)
                setPadding(0, dpi(2), 0, 0)
            })
        }
        return column
    }

    private fun container(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        minimumHeight = dpi(68)
        setPadding(dpi(24), dpi(12), dpi(24), dpi(12))
        background = RippleDrawable(
            ColorStateList.valueOf(0x33888888), null, ColorDrawable(Color.WHITE)
        )
    }

    private fun row(title: String, summary: String?, action: () -> Unit) {
        val view = container()
        view.addView(
            texts(title, summary),
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        )
        view.setOnClickListener { action() }
        list.addView(view)
    }

    private fun toggle(title: String, summary: String?, checked: Boolean, set: (Boolean) -> Unit) {
        val view = container()
        view.addView(
            texts(title, summary),
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        )
        val switch = Switch(this).apply {
            isChecked = checked
            isClickable = false
            isFocusable = false
        }
        view.addView(
            switch,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { marginStart = dpi(16) }
        )
        view.setOnClickListener {
            set(!checked)
            rebuild()
        }
        list.addView(view)
    }

    private fun choose(titleId: Int, labels: List<String>, current: Int, set: (Int) -> Unit) {
        AlertDialog.Builder(this)
            .setTitle(titleId)
            .setSingleChoiceItems(labels.toTypedArray(), current) { dialog, which ->
                set(which)
                dialog.dismiss()
                rebuild()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
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
            Toast.makeText(this, R.string.cannot_open, Toast.LENGTH_SHORT).show()
        }
    }
}
