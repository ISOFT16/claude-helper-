package com.isoft16.vigillauncher

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Activity
import android.app.Application
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.media.AudioManager
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.text.format.DateFormat
import android.view.Gravity
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextClock
import android.widget.TextView
import java.util.Calendar
import java.util.Locale
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.sin

/**
 * Процесс лаунчера следит за выключением экрана и показывает свой экран блокировки
 * поверх системного. Пароль, лицо и отпечаток проверяет сама система.
 */
class LauncherApp : Application() {
    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == Intent.ACTION_SCREEN_OFF) showLockScreen()
        }
    }

    override fun onCreate() {
        super.onCreate()
        val filter = IntentFilter(Intent.ACTION_SCREEN_OFF)
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                registerReceiver(receiver, filter)
            }
        } catch (e: Exception) {
            // Без подписки экран блокировки просто не появится.
        }
    }

    private fun showLockScreen() {
        if (!Prefs.lockEnabled(this)) return
        try {
            // Во время звонка экран гаснет от датчика приближения — блокировку не показываем.
            val audio = getSystemService(AudioManager::class.java)
            if (audio != null && (audio.mode == AudioManager.MODE_IN_CALL ||
                    audio.mode == AudioManager.MODE_IN_COMMUNICATION)
            ) {
                return
            }
            startActivity(
                Intent(this, LockActivity::class.java).addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION
                )
            )
        } catch (e: Exception) {
            // Система не разрешила открыть экран из фона (не выданы разрешения).
        }
    }
}

/** Часы экрана блокировки в нескольких стилях. */
@SuppressLint("ViewConstructor")
class LockClockView(context: Context, private val palette: Palette) : View(context) {
    companion object {
        const val STYLE_COUNT = 7
    }

    var style = 0
        set(value) {
            field = value
            invalidate()
        }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val shadow = 0x66000000
    private val accent: Int = if (palette.dark) palette.accent else palette.themedBg
    private val tick = object : Runnable {
        override fun run() {
            invalidate()
            postDelayed(this, 1000L - System.currentTimeMillis() % 1000L)
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        removeCallbacks(tick)
        post(tick)
    }

    override fun onDetachedFromWindow() {
        removeCallbacks(tick)
        super.onDetachedFromWindow()
    }

    private fun two(value: Int): String = if (value < 10) "0$value" else value.toString()

    private fun text(size: Float, color: Int, medium: Boolean, stroke: Float = 0f) {
        paint.reset()
        paint.isAntiAlias = true
        paint.textSize = size
        paint.color = color
        paint.textAlign = Paint.Align.CENTER
        paint.typeface = if (medium) Fonts.medium(context) else Fonts.regular(context)
        if (stroke > 0f) {
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = stroke
            paint.strokeJoin = Paint.Join.ROUND
        } else {
            paint.style = Paint.Style.FILL
        }
        paint.setShadowLayer(context.dp(6f), 0f, context.dp(2f), shadow)
    }

    override fun onDraw(canvas: Canvas) {
        val calendar = Calendar.getInstance()
        val is24 = DateFormat.is24HourFormat(context)
        var hour = calendar.get(if (is24) Calendar.HOUR_OF_DAY else Calendar.HOUR)
        if (!is24 && hour == 0) hour = 12
        val minute = calendar.get(Calendar.MINUTE)
        val second = calendar.get(Calendar.SECOND)
        val hh = if (is24) two(hour) else hour.toString()
        val mm = two(minute)
        val w = width.toFloat()
        val h = height.toFloat()
        val cx = w / 2f
        val cy = h / 2f

        when (style) {
            // Две строки, как на Pixel
            0, 6 -> {
                val size = min(w * 0.44f, h * 0.5f)
                if (style == 0) text(size, accent, true) else text(size, Color.WHITE, true, context.dp(3f))
                val fm = paint.fontMetrics
                val line = size * 0.9f
                val top = cy - line
                canvas.drawText(hh, cx, top + line - fm.descent * 0.4f, paint)
                canvas.drawText(mm, cx, top + line * 2f - fm.descent * 0.4f, paint)
            }

            // Одна тонкая строка
            1 -> {
                text(min(w * 0.3f, h * 0.7f), Color.WHITE, false)
                val fm = paint.fontMetrics
                canvas.drawText("$hh:$mm", cx, cy - (fm.ascent + fm.descent) / 2f, paint)
            }

            // Часы цветные, минуты белые
            2 -> {
                val size = min(w * 0.34f, h * 0.8f)
                text(size, accent, true)
                val fm = paint.fontMetrics
                val base = cy - (fm.ascent + fm.descent) / 2f
                val half = paint.measureText("00") / 2f + context.dp(6f)
                canvas.drawText(hh, cx - half, base, paint)
                paint.color = Color.WHITE
                canvas.drawText(mm, cx + half, base, paint)
            }

            // Стрелочные: простые и с цифрами
            3, 4 -> drawAnalog(canvas, cx, cy, min(w, h) * 0.44f, calendar, style == 4)

            // С секундами
            else -> {
                val size = min(w * 0.26f, h * 0.7f)
                text(size, Color.WHITE, true)
                val fm = paint.fontMetrics
                val base = cy - (fm.ascent + fm.descent) / 2f
                val main = "$hh:$mm"
                val mainWidth = paint.measureText(main)
                paint.textSize = size * 0.42f
                val secWidth = paint.measureText(":00")
                paint.textSize = size
                val left = cx - (mainWidth + secWidth) / 2f
                canvas.drawText(main, left + mainWidth / 2f, base, paint)
                paint.textSize = size * 0.42f
                paint.color = accent
                canvas.drawText(":" + two(second), left + mainWidth + secWidth / 2f, base, paint)
            }
        }
    }

    private fun drawAnalog(
        canvas: Canvas, cx: Float, cy: Float, radius: Float, calendar: Calendar, detailed: Boolean,
    ) {
        paint.reset()
        paint.isAntiAlias = true
        paint.style = Paint.Style.STROKE
        paint.strokeCap = Paint.Cap.ROUND
        paint.setShadowLayer(context.dp(5f), 0f, context.dp(2f), shadow)

        if (detailed) {
            for (i in 0 until 12) {
                val angle = Math.PI * 2 * i / 12
                val quarter = i % 3 == 0
                paint.color = if (quarter) Color.WHITE else 0xAAFFFFFF.toInt()
                paint.strokeWidth = context.dp(if (quarter) 4f else 2f)
                val inner = radius * if (quarter) 0.86f else 0.91f
                canvas.drawLine(
                    cx + (sin(angle) * inner).toFloat(), cy - (cos(angle) * inner).toFloat(),
                    cx + (sin(angle) * radius).toFloat(), cy - (cos(angle) * radius).toFloat(),
                    paint,
                )
            }
            text(radius * 0.2f, Color.WHITE, true)
            val fm = paint.fontMetrics
            val offset = -(fm.ascent + fm.descent) / 2f
            val ring = radius * 0.68f
            canvas.drawText("12", cx, cy - ring + offset, paint)
            canvas.drawText("6", cx, cy + ring + offset, paint)
            canvas.drawText("3", cx + ring, cy + offset, paint)
            canvas.drawText("9", cx - ring, cy + offset, paint)
            paint.style = Paint.Style.STROKE
            paint.strokeCap = Paint.Cap.ROUND
        } else {
            paint.color = 0x55FFFFFF
            paint.strokeWidth = context.dp(2f)
            canvas.drawCircle(cx, cy, radius, paint)
        }

        val seconds = calendar.get(Calendar.SECOND)
        val minutes = calendar.get(Calendar.MINUTE) + seconds / 60f
        val hours = calendar.get(Calendar.HOUR) + minutes / 60f

        fun hand(turn: Float, length: Float, width: Float, color: Int) {
            val angle = Math.PI * 2 * turn
            paint.color = color
            paint.strokeWidth = width
            canvas.drawLine(
                cx, cy,
                cx + (sin(angle) * length).toFloat(), cy - (cos(angle) * length).toFloat(),
                paint,
            )
        }
        hand(hours / 12f, radius * 0.5f, context.dp(9f), Color.WHITE)
        hand(minutes / 60f, radius * 0.78f, context.dp(6f), accent)
        if (detailed) hand(seconds / 60f, radius * 0.84f, context.dp(2f), Color.WHITE)
        paint.style = Paint.Style.FILL
        paint.color = Color.WHITE
        canvas.drawCircle(cx, cy, context.dp(5f), paint)
    }
}

/** Вспышка или расходящееся кольцо при разблокировке. */
class LockEffectView(context: Context) : View(context) {
    var ring = -1f
        set(value) {
            field = value
            invalidate()
        }
    var flash = 0f
        set(value) {
            field = value
            invalidate()
        }
    var color = Color.WHITE

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    override fun onDraw(canvas: Canvas) {
        if (flash > 0f) {
            canvas.drawColor(Color.argb((flash * 255).toInt().coerceIn(0, 255), 255, 255, 255))
        }
        if (ring >= 0f) {
            val reach = hypot(width.toFloat(), height.toFloat())
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = context.dp(26f) * (1f - ring) + context.dp(2f)
            paint.color = color
            paint.alpha = ((1f - ring) * 255).toInt().coerceIn(0, 255)
            canvas.drawCircle(width / 2f, height * 0.86f, reach * ring, paint)
        }
    }
}

/** Экран блокировки лаунчера: показывается поверх системного и снимается вместе с ним. */
class LockActivity : Activity() {
    companion object {
        const val EXTRA_PREVIEW = "preview"
        const val EFFECT_COUNT = 4
    }

    private lateinit var palette: Palette
    private lateinit var root: FrameLayout
    private lateinit var content: LinearLayout
    private lateinit var clock: LockClockView
    private lateinit var battery: TextView
    private lateinit var hint: TextView
    private lateinit var effect: LockEffectView

    private var preview = false
    private var wasLocked = false
    private var leaving = false
    private var downY = 0f
    private var tracker: VelocityTracker? = null

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                // Отпечаток или лицо сняли системную блокировку — убираем и наш экран.
                Intent.ACTION_USER_PRESENT -> if (!preview) leave()
                Intent.ACTION_SCREEN_OFF -> resetContent()
                Intent.ACTION_BATTERY_CHANGED -> updateBattery(intent)
            }
        }
    }

    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        preview = intent?.getBooleanExtra(EXTRA_PREVIEW, false) ?: false
        palette = Palette(this)

        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
        } else {
            window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
        }
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= 28) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
        } else {
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        }

        buildViews()
        setContentView(root)

        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_USER_PRESENT)
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_BATTERY_CHANGED)
        }
        val sticky = if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(receiver, filter)
        }
        updateBattery(sticky)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        preview = intent?.getBooleanExtra(EXTRA_PREVIEW, false) ?: false
        wasLocked = false
        resetContent()
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(receiver)
        } catch (e: Exception) {
            // Уже снят.
        }
    }

    override fun onResume() {
        super.onResume()
        clock.style = Prefs.lockClock(this)
        checkUnlocked()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) checkUnlocked()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (preview) finish()
    }

    private fun isLocked(): Boolean = try {
        getSystemService(KeyguardManager::class.java)?.isKeyguardLocked ?: false
    } catch (e: Exception) {
        false
    }

    /** Если системная блокировка была и исчезла — телефон разблокирован другим способом. */
    private fun checkUnlocked() {
        if (preview || leaving) return
        if (isLocked()) {
            wasLocked = true
        } else if (wasLocked) {
            leave()
        }
    }

    private fun buildViews() {
        root = FrameLayout(this)
        root.setBackgroundColor(0x59000000)

        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }

        val pattern = DateFormat.getBestDateTimePattern(Locale.getDefault(), "EEEEMMMMd")
        val date = TextClock(this).apply {
            format12Hour = pattern
            format24Hour = pattern
            setTextColor(Color.WHITE)
            textSize = 19f
            typeface = Fonts.regular(this@LockActivity)
            gravity = Gravity.CENTER
            setShadowLayer(dp(4f), 0f, dp(1f), 0x99000000.toInt())
        }
        content.addView(
            date,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dpi(96) }
        )

        clock = LockClockView(this, palette)
        clock.style = Prefs.lockClock(this)
        content.addView(
            clock,
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dpi(300)).apply {
                topMargin = dpi(8)
            }
        )

        battery = TextView(this).apply {
            setTextColor(0xDDFFFFFF.toInt())
            textSize = 15f
            typeface = Fonts.regular(this@LockActivity)
            gravity = Gravity.CENTER
            setShadowLayer(dp(4f), 0f, dp(1f), 0x99000000.toInt())
        }
        content.addView(
            battery,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
            )
        )
        root.addView(
            content,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
            )
        )

        hint = TextView(this).apply {
            text = getString(R.string.lock_hint)
            setTextColor(0xCCFFFFFF.toInt())
            textSize = 15f
            typeface = Fonts.regular(this@LockActivity)
            gravity = Gravity.CENTER
            setShadowLayer(dp(4f), 0f, dp(1f), 0x99000000.toInt())
        }
        root.addView(
            hint,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.BOTTOM
                bottomMargin = dpi(72)
            }
        )

        effect = LockEffectView(this)
        effect.color = if (palette.dark) palette.accent else palette.themedBg
        root.addView(
            effect,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
            )
        )

        root.setOnTouchListener { _, event -> onSwipe(event) }
    }

    private fun updateBattery(intent: Intent?) {
        if (intent == null) return
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
        if (level < 0 || scale <= 0) return
        val percent = level * 100 / scale
        val charging = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0
        battery.text = if (charging) {
            getString(R.string.lock_charging, percent)
        } else {
            getString(R.string.lock_battery, percent)
        }
    }

    // ---------------------------------------------------------------- разблокировка

    private fun resetContent() {
        leaving = false
        root.animate().cancel()
        content.animate().cancel()
        hint.animate().cancel()
        root.alpha = 1f
        content.alpha = 1f
        content.translationY = 0f
        content.scaleX = 1f
        content.scaleY = 1f
        hint.alpha = 1f
        hint.translationY = 0f
        effect.ring = -1f
        effect.flash = 0f
    }

    /** Свайп вверх: содержимое тянется за пальцем, после отпускания запрашивается разблокировка. */
    private fun onSwipe(event: MotionEvent): Boolean {
        if (leaving) return true
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downY = event.rawY
                tracker?.recycle()
                tracker = VelocityTracker.obtain().also { it.addMovement(event) }
            }

            MotionEvent.ACTION_MOVE -> {
                tracker?.addMovement(event)
                val dy = (event.rawY - downY).coerceAtMost(0f)
                val pull = (-dy / (root.height * 0.5f)).coerceIn(0f, 1f)
                content.translationY = dy * 0.45f
                content.alpha = 1f - pull * 0.7f
                hint.translationY = dy * 0.8f
                hint.alpha = 1f - pull
            }

            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                var velocity = 0f
                tracker?.let {
                    it.computeCurrentVelocity(1000)
                    velocity = it.yVelocity
                    it.recycle()
                }
                tracker = null
                val dy = event.rawY - downY
                val swiped = event.actionMasked == MotionEvent.ACTION_UP &&
                    (dy < -root.height * 0.18f || velocity < -dp(900f))
                if (swiped) requestUnlock() else springBack()
            }
        }
        return true
    }

    private fun springBack() {
        content.animate().translationY(0f).alpha(1f).setDuration(320)
            .setInterpolator(OvershootInterpolator(1.3f)).start()
        hint.animate().translationY(0f).alpha(1f).setDuration(320).start()
    }

    private fun requestUnlock() {
        if (preview || !isLocked()) {
            leave()
            return
        }
        val keyguard = getSystemService(KeyguardManager::class.java)
        if (keyguard == null) {
            leave()
            return
        }
        // Система сама спросит пароль, лицо или отпечаток, если они настроены.
        try {
            keyguard.requestDismissKeyguard(
                this,
                object : KeyguardManager.KeyguardDismissCallback() {
                    override fun onDismissSucceeded() = leave()
                    override fun onDismissError() = leave()
                    override fun onDismissCancelled() = springBack()
                }
            )
        } catch (e: Exception) {
            leave()
        }
    }

    /** Проигрывает выбранный эффект и закрывает экран. */
    @Suppress("DEPRECATION")
    private fun leave() {
        if (leaving || isFinishing) return
        leaving = true
        val duration = 380L
        val smooth = DecelerateInterpolator(1.6f)
        hint.animate().alpha(0f).setDuration(160).start()
        when (Prefs.lockEffect(this)) {
            // Увеличение
            0 -> content.animate().scaleX(1.35f).scaleY(1.35f).alpha(0f)
                .setDuration(duration).setInterpolator(smooth).start()
            // Уход вверх
            1 -> content.animate().translationY(-root.height * 0.45f).alpha(0f)
                .setDuration(duration).setInterpolator(smooth).start()
            // Кольцо
            2 -> {
                content.animate().alpha(0f).setDuration(duration).start()
                ValueAnimator.ofFloat(0f, 1f).apply {
                    this.duration = duration
                    interpolator = smooth
                    addUpdateListener { effect.ring = it.animatedFraction }
                }.start()
            }
            // Вспышка
            else -> {
                content.animate().alpha(0f).scaleX(1.1f).scaleY(1.1f)
                    .setDuration(duration).start()
                ValueAnimator.ofFloat(0f, 1f).apply {
                    this.duration = duration
                    addUpdateListener {
                        val f = it.animatedFraction
                        effect.flash = (if (f < 0.3f) f / 0.3f else (1f - f) / 0.7f) * 0.45f
                    }
                }.start()
            }
        }
        root.animate().alpha(0f).setStartDelay(120).setDuration(duration - 120)
            .withEndAction {
                finish()
                overridePendingTransition(0, 0)
            }.start()
    }
}
