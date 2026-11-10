package com.isoft16.vigillauncher

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.LauncherApps
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.drawable.AdaptiveIconDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.UserHandle
import java.text.Collator
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** Рисует круглые иконки, как в Pixel: адаптивные слои обрезаются по кругу. */
object IconFactory {
    fun create(raw: Drawable, size: Int, themed: Boolean, palette: Palette): Bitmap {
        val layer = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(layer)
        if (raw is AdaptiveIconDrawable) {
            // Слои адаптивной иконки на четверть шире видимой области с каждой стороны.
            val extra = (size * 0.25f).toInt()
            val mono = if (themed && Build.VERSION.SDK_INT >= 33) raw.monochrome else null
            if (mono != null) {
                canvas.drawColor(palette.themedBg)
                val tinted = mono.mutate()
                tinted.setTint(palette.themedFg)
                tinted.setBounds(-extra, -extra, size + extra, size + extra)
                tinted.draw(canvas)
            } else {
                raw.background?.let {
                    it.setBounds(-extra, -extra, size + extra, size + extra)
                    it.draw(canvas)
                }
                raw.foreground?.let {
                    it.setBounds(-extra, -extra, size + extra, size + extra)
                    it.draw(canvas)
                }
            }
        } else {
            // Старые иконки уменьшаются и кладутся на белый круг.
            canvas.drawColor(Color.WHITE)
            val inset = (size * 0.16f).toInt()
            raw.setBounds(inset, inset, size - inset, size - inset)
            raw.draw(canvas)
        }
        val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.shader = BitmapShader(layer, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP)
        Canvas(out).drawCircle(size / 2f, size / 2f, size / 2f, paint)
        return out
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
        val palette = Palette(context)
        val size = context.dpi(ICON_DP)
        val ownPackage = context.packageName
        val fallbackIcon = context.packageManager.defaultActivityIcon
        executor.execute {
            val user = Process.myUserHandle()
            val activities = try {
                launcherApps.getActivityList(null, user)
            } catch (e: Exception) {
                emptyList()
            }
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
                    result.add(
                        AppEntry(
                            info.componentName,
                            user,
                            label,
                            IconFactory.create(raw, size, themed, palette),
                            system,
                        )
                    )
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
