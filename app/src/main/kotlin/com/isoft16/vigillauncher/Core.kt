package com.isoft16.vigillauncher

import android.content.ComponentName
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Typeface
import android.os.Build
import android.os.UserHandle

fun Context.dp(value: Float): Float = value * resources.displayMetrics.density

fun Context.dpi(value: Int): Int = (value * resources.displayMetrics.density + 0.5f).toInt()

/** Одно приложение из списка установленных. */
class AppEntry(
    val component: ComponentName,
    val user: UserHandle,
    val label: String,
    val icon: Bitmap,
    val isSystem: Boolean,
) {
    val key: String = component.flattenToShortString()
}

/** Настройки лаунчера. Любое изменение увеличивает счётчик, по которому главный экран обновляется. */
object Prefs {
    const val SHAPE_CIRCLE = 0
    const val SHAPE_SQUIRCLE = 1
    const val SHAPE_ROUNDED = 2
    const val SHAPE_SQUARE = 3

    private fun prefs(context: Context) =
        context.getSharedPreferences("settings", Context.MODE_PRIVATE)

    private fun putBoolean(context: Context, key: String, value: Boolean) {
        val p = prefs(context)
        p.edit().putBoolean(key, value).putInt("version", p.getInt("version", 0) + 1).apply()
    }

    private fun putInt(context: Context, key: String, value: Int) {
        val p = prefs(context)
        p.edit().putInt(key, value).putInt("version", p.getInt("version", 0) + 1).apply()
    }

    fun version(context: Context): Int = prefs(context).getInt("version", 0)

    fun themedIcons(context: Context): Boolean = prefs(context).getBoolean("themed", false)
    fun setThemedIcons(context: Context, value: Boolean) = putBoolean(context, "themed", value)

    /** Одноцветные значки даже для приложений, у которых их нет. */
    fun themedAll(context: Context): Boolean = prefs(context).getBoolean("themedAll", true)
    fun setThemedAll(context: Context, value: Boolean) = putBoolean(context, "themedAll", value)

    fun columns(context: Context): Int = prefs(context).getInt("columns", 4).coerceIn(4, 5)
    fun setColumns(context: Context, value: Int) = putInt(context, "columns", value)

    fun rows(context: Context): Int = prefs(context).getInt("rows", 5).coerceIn(5, 6)
    fun setRows(context: Context, value: Int) = putInt(context, "rows", value)

    fun iconShape(context: Context): Int = prefs(context).getInt("shape", SHAPE_CIRCLE)
    fun setIconShape(context: Context, value: Int) = putInt(context, "shape", value)

    fun iconSizeDp(context: Context): Int = prefs(context).getInt("iconSize", 58).coerceIn(48, 68)
    fun setIconSizeDp(context: Context, value: Int) = putInt(context, "iconSize", value)

    fun homeLabels(context: Context): Boolean = prefs(context).getBoolean("homeLabels", true)
    fun setHomeLabels(context: Context, value: Boolean) = putBoolean(context, "homeLabels", value)

    fun animations(context: Context): Boolean = prefs(context).getBoolean("animations", true)
    fun setAnimations(context: Context, value: Boolean) = putBoolean(context, "animations", value)

    /** Пакет выбранного набора значков; пустая строка — значки самих приложений. */
    fun iconPack(context: Context): String = prefs(context).getString("iconPack", "") ?: ""
    fun setIconPack(context: Context, value: String) {
        val p = prefs(context)
        p.edit().putString("iconPack", value).putInt("version", p.getInt("version", 0) + 1).apply()
    }
}

/** Шрифт Google Sans из ресурсов приложения. */
object Fonts {
    private var regular: Typeface? = null
    private var medium: Typeface? = null

    fun regular(context: Context): Typeface {
        regular?.let { return it }
        val font = try {
            context.resources.getFont(R.font.google_sans_regular)
        } catch (e: Exception) {
            Typeface.DEFAULT
        }
        regular = font
        return font
    }

    fun medium(context: Context): Typeface {
        medium?.let { return it }
        val font = try {
            context.resources.getFont(R.font.google_sans_medium)
        } catch (e: Exception) {
            Typeface.DEFAULT_BOLD
        }
        medium = font
        return font
    }
}

/** Цвета в стиле Material You: на Android 12+ берутся из обоев, иначе запасная палитра. */
class Palette(context: Context) {
    val dark: Boolean =
        (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES

    val surface: Int
    val container: Int
    val onSurface: Int
    val onSurfaceVariant: Int
    val accent: Int
    val pill: Int
    val themedBg: Int
    val themedFg: Int

    init {
        if (Build.VERSION.SDK_INT >= 31) {
            if (dark) {
                surface = context.getColor(android.R.color.system_neutral1_900)
                container = context.getColor(android.R.color.system_neutral2_800)
                onSurface = context.getColor(android.R.color.system_neutral1_50)
                onSurfaceVariant = context.getColor(android.R.color.system_neutral2_200)
                accent = context.getColor(android.R.color.system_accent1_200)
                pill = context.getColor(android.R.color.system_neutral1_800)
                themedBg = context.getColor(android.R.color.system_neutral1_800)
                themedFg = context.getColor(android.R.color.system_accent1_100)
            } else {
                surface = context.getColor(android.R.color.system_neutral1_50)
                container = context.getColor(android.R.color.system_neutral2_100)
                onSurface = context.getColor(android.R.color.system_neutral1_900)
                onSurfaceVariant = context.getColor(android.R.color.system_neutral2_700)
                accent = context.getColor(android.R.color.system_accent1_600)
                pill = context.getColor(android.R.color.system_neutral1_10)
                themedBg = context.getColor(android.R.color.system_accent1_100)
                themedFg = context.getColor(android.R.color.system_accent1_700)
            }
        } else if (dark) {
            surface = 0xFF1B1B1F.toInt()
            container = 0xFF2B2B30.toInt()
            onSurface = 0xFFE4E2E6.toInt()
            onSurfaceVariant = 0xFFC6C6D0.toInt()
            accent = 0xFFB4C5FF.toInt()
            pill = 0xFF2B2B30.toInt()
            themedBg = 0xFF2B2B30.toInt()
            themedFg = 0xFFDCE1FF.toInt()
        } else {
            surface = 0xFFFBF8FD.toInt()
            container = 0xFFE9E7EF.toInt()
            onSurface = 0xFF1B1B1F.toInt()
            onSurfaceVariant = 0xFF46464F.toInt()
            accent = 0xFF3F5AA9.toInt()
            pill = 0xFFFFFFFF.toInt()
            themedBg = 0xFFDCE1FF.toInt()
            themedFg = 0xFF3F4759.toInt()
        }
    }
}
