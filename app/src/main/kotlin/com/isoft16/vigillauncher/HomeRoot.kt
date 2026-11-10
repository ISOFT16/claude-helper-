package com.isoft16.vigillauncher

import android.annotation.SuppressLint
import android.content.Context
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.ViewConfiguration
import android.widget.FrameLayout
import kotlin.math.abs

/**
 * Корневой контейнер главного экрана. Разбирает жесты: влево-вправо листает экраны,
 * вверх открывает меню приложений, вниз — шторку уведомлений, долгое нажатие на пустом
 * месте открывает меню лаунчера.
 */
class HomeRoot(context: Context) : FrameLayout(context) {
    interface Host {
        fun drawerProgress(): Float
        fun workspace(): Workspace
        fun onDrawerDrag(dy: Float)
        fun onDrawerRelease(velocityY: Float)
        fun onSwipeDown()
        fun onEmptyLongPress(x: Float, y: Float)
    }

    private companion object {
        const val NONE = 0
        const val PAGE = 1
        const val DRAWER = 2
        const val CONSUMED = 3
    }

    var host: Host? = null

    private val slop = ViewConfiguration.get(context).scaledTouchSlop
    private var mode = NONE
    private var blocked = false
    private var downX = 0f
    private var downY = 0f
    private var lastX = 0f
    private var tracker: VelocityTracker? = null

    private val longPress = Runnable {
        if (mode == NONE && !blocked) {
            mode = CONSUMED
            performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
            host?.onEmptyLongPress(downX, downY)
        }
    }

    private fun begin(ev: MotionEvent) {
        removeCallbacks(longPress)
        downX = ev.x
        downY = ev.y
        lastX = ev.x
        mode = NONE
        // Пока меню приложений открыто, жесты главного экрана не работают.
        blocked = (host?.drawerProgress() ?: 0f) > 0f
        tracker?.recycle()
        tracker = VelocityTracker.obtain().also { it.addMovement(ev) }
    }

    private fun move(ev: MotionEvent) {
        if (blocked) return
        val h = host ?: return
        tracker?.addMovement(ev)
        val dx = ev.x - downX
        val dy = ev.y - downY
        if (mode == NONE) {
            if (abs(dx) > slop && abs(dx) > abs(dy)) {
                mode = PAGE
                lastX = ev.x
            } else if (abs(dy) > slop) {
                if (dy < 0) {
                    mode = DRAWER
                } else {
                    mode = CONSUMED
                    h.onSwipeDown()
                }
            }
            if (mode != NONE) removeCallbacks(longPress)
        }
        when (mode) {
            PAGE -> {
                h.workspace().dragBy(lastX - ev.x)
                lastX = ev.x
            }
            DRAWER -> h.onDrawerDrag(dy)
        }
    }

    private fun finish(cancelled: Boolean) {
        removeCallbacks(longPress)
        var vx = 0f
        var vy = 0f
        tracker?.let {
            it.computeCurrentVelocity(1000)
            vx = it.xVelocity
            vy = it.yVelocity
            it.recycle()
        }
        tracker = null
        when (mode) {
            PAGE -> host?.workspace()?.settle(if (cancelled) 0f else vx)
            DRAWER -> host?.onDrawerRelease(if (cancelled) 0f else vy)
        }
        mode = NONE
    }

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean {
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> begin(ev)
            MotionEvent.ACTION_MOVE -> {
                move(ev)
                return mode != NONE
            }
            MotionEvent.ACTION_UP -> finish(false)
            MotionEvent.ACTION_CANCEL -> finish(true)
        }
        return false
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(ev: MotionEvent): Boolean {
        when (ev.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                begin(ev)
                if (!blocked) {
                    postDelayed(longPress, ViewConfiguration.getLongPressTimeout().toLong())
                }
            }
            MotionEvent.ACTION_MOVE -> move(ev)
            MotionEvent.ACTION_UP -> finish(false)
            MotionEvent.ACTION_CANCEL -> finish(true)
        }
        return true
    }
}
