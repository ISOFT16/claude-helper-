package com.isoft16.vigillauncher

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.LauncherApps
import android.content.res.Resources
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.drawable.AdaptiveIconDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.UserHandle
import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserFactory
import java.text.Collator
import java.util.Calendar
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sign
import kotlin.math.sin

/** Как рисовать значки: размер, форма, тема и набор значков. */
class IconStyle(
    val size: Int,
    val shape: Int,
    val themed: Boolean,
    val themedAll: Boolean,
    val palette: Palette,
    val pack: IconPack?,
)

/**
 * Набор значков в общепринятом формате (ADW / Nova): приложение с файлом appfilter.xml,
 * где каждому приложению сопоставлена картинка.
 */
class IconPack private constructor(
    private val packageName: String,
    private val resources: Resources,
    private val drawables: Map<String, String>,
    private val backs: List<String>,
    private val upon: String?,
    val scale: Float,
) {
    companion object {
        private val ACTIONS = listOf(
            "org.adw.launcher.THEMES",
            "com.novalauncher.THEME",
            "org.adw.launcher.icons.ACTION_PICK_ICON",
            "com.gau.go.launcherex.theme",
        )

        /** Установленные наборы значков: пакет и название. */
        fun installed(context: Context): List<Pair<String, String>> {
            val pm = context.packageManager
            val found = LinkedHashMap<String, String>()
            for (action in ACTIONS) {
                try {
                    for (info in pm.queryIntentActivities(Intent(action), 0)) {
                        val pkg = info.activityInfo?.packageName ?: continue
                        if (pkg in found) continue
                        found[pkg] = info.activityInfo.applicationInfo.loadLabel(pm).toString()
                    }
                } catch (e: Exception) {
                    // Пропускаем действие, которое не удалось запросить.
                }
            }
            return found.map { it.key to it.value }.sortedBy { it.second.lowercase() }
        }

        fun load(context: Context, packageName: String): IconPack? {
            if (packageName.isEmpty()) return null
            return try {
                val res = context.packageManager.getResourcesForApplication(packageName)
                val parser = openFilter(res, packageName) ?: return null
                val drawables = HashMap<String, String>()
                val backs = ArrayList<String>()
                var upon: String? = null
                var scale = 1f
                val day = Calendar.getInstance().get(Calendar.DAY_OF_MONTH)
                var event = parser.eventType
                while (event != XmlPullParser.END_DOCUMENT) {
                    if (event == XmlPullParser.START_TAG) {
                        when (parser.name) {
                            "item" -> {
                                val component = parseComponent(
                                    parser.getAttributeValue(null, "component")
                                )
                                val drawable = parser.getAttributeValue(null, "drawable")
                                if (component != null && !drawable.isNullOrEmpty() &&
                                    component !in drawables
                                ) {
                                    drawables[component] = drawable
                                }
                            }

                            "calendar" -> {
                                val component = parseComponent(
                                    parser.getAttributeValue(null, "component")
                                )
                                val prefix = parser.getAttributeValue(null, "prefix")
                                if (component != null && !prefix.isNullOrEmpty()) {
                                    drawables[component] = prefix + day
                                }
                            }

                            "iconback" -> {
                                for (i in 0 until parser.attributeCount) {
                                    val value = parser.getAttributeValue(i)
                                    if (!value.isNullOrEmpty()) backs.add(value)
                                }
                            }

                            "iconupon" -> upon = parser.getAttributeValue(null, "img1")

                            "scale" -> scale = parser.getAttributeValue(null, "factor")
                                ?.toFloatOrNull()?.coerceIn(0.4f, 1.2f) ?: 1f
                        }
                    }
                    event = parser.next()
                }
                IconPack(packageName, res, drawables, backs, upon, scale)
            } catch (e: Exception) {
                null
            }
        }

        private fun openFilter(res: Resources, packageName: String): XmlPullParser? {
            @Suppress("DiscouragedApi")
            val id = res.getIdentifier("appfilter", "xml", packageName)
            if (id != 0) return res.getXml(id)
            return try {
                val parser = XmlPullParserFactory.newInstance().newPullParser()
                parser.setInput(res.assets.open("appfilter.xml"), "UTF-8")
                parser
            } catch (e: Exception) {
                null
            }
        }

        /** «ComponentInfo{пакет/класс}» → «пакет/класс». */
        private fun parseComponent(value: String?): String? {
            if (value == null) return null
            val start = value.indexOf('{')
            val end = value.indexOf('}')
            if (start < 0 || end <= start) return null
            val inner = value.substring(start + 1, end)
            val slash = inner.indexOf('/')
            if (slash <= 0) return null
            val pkg = inner.substring(0, slash)
            var cls = inner.substring(slash + 1)
            if (cls.startsWith(".")) cls = pkg + cls
            return "$pkg/$cls"
        }
    }

    private fun drawable(name: String?): Drawable? {
        if (name.isNullOrEmpty()) return null
        return try {
            @Suppress("DiscouragedApi")
            var id = resources.getIdentifier(name, "drawable", packageName)
            if (id == 0) {
                @Suppress("DiscouragedApi")
                id = resources.getIdentifier(name, "mipmap", packageName)
            }
            if (id == 0) null else resources.getDrawable(id, null)
        } catch (e: Exception) {
            null
        }
    }

    /** Значок из набора для приложения или null, если в наборе его нет. */
    fun iconFor(component: ComponentName): Drawable? =
        drawable(drawables[component.packageName + "/" + component.className])

    /** Подложка для приложений, которых нет в наборе. */
    fun backFor(component: ComponentName): Drawable? {
        if (backs.isEmpty()) return null
        return drawable(backs[abs(component.hashCode()) % backs.size])
    }

    fun uponDrawable(): Drawable? = drawable(upon)
}

/** Рисует значки: обрезает по выбранной форме, красит в цвета темы, подставляет набор значков. */
object IconFactory {

    fun create(raw: Drawable, component: ComponentName, style: IconStyle): Bitmap {
        val pack = style.pack
        if (pack != null) {
            val themedIcon = pack.iconFor(component)
            if (themedIcon != null) {
                // Адаптивный значок из набора обрезается по нашей форме, обычный рисуется как есть.
                if (themedIcon is AdaptiveIconDrawable) return shaped(themedIcon, style, false)
                return plain(themedIcon, style.size)
            }
            val back = pack.backFor(component)
            if (back != null) return onBack(raw, back, pack, style)
        }
        return shaped(raw, style, style.themed)
    }

    private fun plain(drawable: Drawable, size: Int): Bitmap {
        val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        drawable.setBounds(0, 0, size, size)
        drawable.draw(Canvas(out))
        return out
    }

    /** Приложение без значка в наборе: его значок уменьшается и кладётся на подложку набора. */
    private fun onBack(raw: Drawable, back: Drawable, pack: IconPack, style: IconStyle): Bitmap {
        val size = style.size
        val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        back.setBounds(0, 0, size, size)
        back.draw(canvas)
        val inner = shaped(raw, style, false)
        val scaled = size * pack.scale
        val offset = (size - scaled) / 2f
        canvas.drawBitmap(
            inner, null, RectF(offset, offset, offset + scaled, offset + scaled),
            Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        )
        pack.uponDrawable()?.let {
            it.setBounds(0, 0, size, size)
            it.draw(canvas)
        }
        return out
    }

    private fun shaped(raw: Drawable, style: IconStyle, themed: Boolean): Bitmap {
        val size = style.size
        val layer = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(layer)
        // Слои адаптивного значка на четверть шире видимой области с каждой стороны.
        val extra = (size * 0.25f).toInt()
        var done = false

        if (themed) {
            val mono = if (raw is AdaptiveIconDrawable && Build.VERSION.SDK_INT >= 33) {
                raw.monochrome
            } else {
                null
            }
            if (mono != null) {
                canvas.drawColor(style.palette.themedBg)
                val tinted = mono.mutate()
                tinted.setTint(style.palette.themedFg)
                tinted.setBounds(-extra, -extra, size + extra, size + extra)
                tinted.draw(canvas)
                done = true
            } else if (style.themedAll) {
                val mask = generatedMask(raw, size, extra)
                if (mask != null) {
                    canvas.drawColor(style.palette.themedBg)
                    val paint = Paint(Paint.FILTER_BITMAP_FLAG)
                    paint.colorFilter =
                        PorterDuffColorFilter(style.palette.themedFg, PorterDuff.Mode.SRC_IN)
                    canvas.drawBitmap(mask, 0f, 0f, paint)
                    done = true
                }
            }
        }

        if (!done) {
            if (raw is AdaptiveIconDrawable) {
                raw.background?.let {
                    it.setBounds(-extra, -extra, size + extra, size + extra)
                    it.draw(canvas)
                }
                raw.foreground?.let {
                    it.setBounds(-extra, -extra, size + extra, size + extra)
                    it.draw(canvas)
                }
            } else {
                // Старые значки уменьшаются и кладутся на белую подложку.
                canvas.drawColor(Color.WHITE)
                val inset = (size * 0.16f).toInt()
                raw.setBounds(inset, inset, size - inset, size - inset)
                raw.draw(canvas)
            }
        }

        val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.shader = BitmapShader(layer, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        Canvas(out).drawPath(shapePath(style.shape, size.toFloat()), paint)
        return out
    }

    /**
     * Одноцветный силуэт для приложения без собственного тематического значка.
     * Если рисунок с прозрачным фоном — берётся его контур; если он залит целиком —
     * выделяются места, которые отличаются по яркости от основного фона.
     */
    private fun generatedMask(raw: Drawable, size: Int, extra: Int): Bitmap? {
        val source = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(source)
        if (raw is AdaptiveIconDrawable) {
            val foreground = raw.foreground ?: return null
            foreground.setBounds(-extra, -extra, size + extra, size + extra)
            foreground.draw(canvas)
        } else {
            val inset = (size * 0.2f).toInt()
            raw.setBounds(inset, inset, size - inset, size - inset)
            raw.draw(canvas)
        }
        val pixels = IntArray(size * size)
        source.getPixels(pixels, 0, size, 0, 0, size, size)

        var opaque = 0
        var luminanceSum = 0.0
        for (pixel in pixels) {
            if ((pixel ushr 24) > 128) {
                opaque++
                luminanceSum += luminance(pixel)
            }
        }
        if (opaque == 0) return null
        val coverage = opaque.toFloat() / pixels.size
        val legacy = raw !is AdaptiveIconDrawable
        val silhouette = if (legacy) coverage < 0.3f else coverage < 0.75f

        var visible = 0
        if (!silhouette) {
            val mean = (luminanceSum / opaque).toFloat()
            for (i in pixels.indices) {
                val pixel = pixels[i]
                val alpha = pixel ushr 24
                val contrast = (abs(luminance(pixel) - mean) * 3.2f).coerceIn(0f, 1f)
                val a = (alpha * contrast).toInt()
                if (a > 96) visible++
                pixels[i] = (a shl 24) or 0xFFFFFF
            }
            // Однотонная картинка без деталей в силуэт не превращается.
            if (visible < pixels.size * 0.02f) return null
        }
        source.setPixels(pixels, 0, size, 0, 0, size, size)
        return source
    }

    private fun luminance(pixel: Int): Float {
        val r = (pixel shr 16) and 0xFF
        val g = (pixel shr 8) and 0xFF
        val b = pixel and 0xFF
        return (0.299f * r + 0.587f * g + 0.114f * b) / 255f
    }

    fun shapePath(shape: Int, size: Float): Path {
        val path = Path()
        when (shape) {
            Prefs.SHAPE_SQUIRCLE -> {
                // Суперэллипс: что-то среднее между кругом и квадратом.
                val half = size / 2f
                val exponent = 2.0 / 4.6
                val steps = 72
                for (i in 0..steps) {
                    val angle = 2.0 * Math.PI * i / steps
                    val c = cos(angle)
                    val s = sin(angle)
                    val x = half + half * sign(c) * abs(c).pow(exponent)
                    val y = half + half * sign(s) * abs(s).pow(exponent)
                    if (i == 0) path.moveTo(x.toFloat(), y.toFloat())
                    else path.lineTo(x.toFloat(), y.toFloat())
                }
                path.close()
            }

            Prefs.SHAPE_ROUNDED -> {
                val radius = size * 0.28f
                path.addRoundRect(RectF(0f, 0f, size, size), radius, radius, Path.Direction.CW)
            }

            Prefs.SHAPE_SQUARE -> {
                val radius = size * 0.12f
                path.addRoundRect(RectF(0f, 0f, size, size), radius, radius, Path.Direction.CW)
            }

            else -> path.addCircle(size / 2f, size / 2f, size / 2f, Path.Direction.CW)
        }
        return path
    }
}

/** Загружает список приложений в фоне и следит за установкой и удалением. */
class AppRepository(private val context: Context) {
    private val launcherApps = context.getSystemService(LauncherApps::class.java)
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var generation = 0
    private var started = false

    var apps: List<AppEntry> = emptyList()
        private set
    var byKey: Map<String, AppEntry> = emptyMap()
        private set
    var loaded = false
        private set
    var listener: (() -> Unit)? = null

    private val callback = object : LauncherApps.Callback() {
        override fun onPackageRemoved(packageName: String?, user: UserHandle?) = reload()
        override fun onPackageAdded(packageName: String?, user: UserHandle?) = reload()
        override fun onPackageChanged(packageName: String?, user: UserHandle?) = reload()
        override fun onPackagesAvailable(
            packageNames: Array<out String>?,
            user: UserHandle?,
            replacing: Boolean,
        ) = reload()

        override fun onPackagesUnavailable(
            packageNames: Array<out String>?,
            user: UserHandle?,
            replacing: Boolean,
        ) = reload()
    }

    fun start() {
        if (started) return
        started = true
        try {
            launcherApps.registerCallback(callback, main)
        } catch (e: Exception) {
            // Без подписки список просто не обновится сам.
        }
        reload()
    }

    fun stop() {
        if (!started) return
        started = false
        generation++
        try {
            launcherApps.unregisterCallback(callback)
        } catch (e: Exception) {
            // Ничего страшного.
        }
        executor.shutdown()
    }

    fun reload() {
        if (!started) return
        val gen = ++generation
        val themed = Prefs.themedIcons(context)
        val themedAll = Prefs.themedAll(context)
        val shape = Prefs.iconShape(context)
        val packName = Prefs.iconPack(context)
        val palette = Palette(context)
        val size = context.dpi(Prefs.iconSizeDp(context))
        val ownPackage = context.packageName
        val fallbackIcon = context.packageManager.defaultActivityIcon
        executor.execute {
            val user = Process.myUserHandle()
            val activities = try {
                launcherApps.getActivityList(null, user)
            } catch (e: Exception) {
                emptyList()
            }
            val style = IconStyle(
                size, shape, themed, themedAll, palette, IconPack.load(context, packName)
            )
            val collator = Collator.getInstance()
            val result = ArrayList<AppEntry>()
            for (info in activities) {
                if (info.componentName.packageName == ownPackage) continue
                try {
                    val raw = info.getIcon(0) ?: fallbackIcon
                    val label = info.label?.toString()?.trim().orEmpty()
                        .ifEmpty { info.componentName.packageName }
                    val system =
                        (info.applicationInfo.flags and ApplicationInfo.FLAG_SYSTEM) != 0
                    val icon = try {
                        IconFactory.create(raw, info.componentName, style)
                    } catch (e: Exception) {
                        IconFactory.create(
                            fallbackIcon, info.componentName,
                            IconStyle(size, shape, false, false, palette, null)
                        )
                    }
                    result.add(AppEntry(info.componentName, user, label, icon, system))
                } catch (e: Exception) {
                    // Пропускаем приложение, которое не удалось прочитать.
                }
            }
            result.sortWith { a, b -> collator.compare(a.label, b.label) }
            main.post {
                if (gen == generation) {
                    apps = result
                    byKey = result.associateBy { it.key }
                    loaded = true
                    listener?.invoke()
                }
            }
        }
    }
}
