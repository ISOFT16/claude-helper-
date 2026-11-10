package com.isoft16.vigilvoice

import android.Manifest
import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.app.SearchManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Path
import android.graphics.Point
import android.graphics.Rect
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.os.SystemClock
import android.provider.ContactsContract
import android.telecom.TelecomManager
import android.view.KeyEvent
import android.view.WindowManager
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo

/** Всё, что телефон умеет делать по команде. Каждый метод возвращает, получилось ли. */
class Actions(private val svc: AccessibilityService) {

    private val audio = svc.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    // ---------- экран и жесты ----------

    private fun screenSize(): Point {
        val wm = svc.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        if (Build.VERSION.SDK_INT >= 30) {
            val b = wm.currentWindowMetrics.bounds
            return Point(b.width(), b.height())
        }
        val p = Point()
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealSize(p)
        return p
    }

    fun tap(x: Float, y: Float, long: Boolean = false): Boolean {
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0, if (long) 800 else 60)
        return svc.dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
    }

    private fun swipe(x1: Float, y1: Float, x2: Float, y2: Float): Boolean {
        val path = Path().apply {
            moveTo(x1, y1)
            lineTo(x2, y2)
        }
        val stroke = GestureDescription.StrokeDescription(path, 0, 280)
        return svc.dispatchGesture(GestureDescription.Builder().addStroke(stroke).build(), null, null)
    }

    /** «Вниз» — показать то, что ниже, то есть провести пальцем вверх. */
    fun scroll(dir: Dir): Boolean {
        val s = screenSize()
        val w = s.x.toFloat()
        val h = s.y.toFloat()
        return when (dir) {
            Dir.DOWN -> swipe(w / 2, h * 0.70f, w / 2, h * 0.30f)
            Dir.UP -> swipe(w / 2, h * 0.30f, w / 2, h * 0.70f)
            Dir.LEFT -> swipe(w * 0.85f, h / 2, w * 0.15f, h / 2)
            Dir.RIGHT -> swipe(w * 0.15f, h / 2, w * 0.85f, h / 2)
        }
    }

    fun global(action: Int): Boolean = svc.performGlobalAction(action)

    fun wakeScreen(): Boolean {
        val pm = svc.getSystemService(Context.POWER_SERVICE) as PowerManager
        return try {
            @Suppress("DEPRECATION")
            pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "vigilvoice:wake",
            ).acquire(3_000)
            true
        } catch (_: Exception) {
            false
        }
    }

    // ---------- чтение экрана ----------

    /** Окна сверху вниз. Свой прозрачный слой пропускаем. */
    private fun windowRoots(): List<Pair<AccessibilityWindowInfo?, AccessibilityNodeInfo>> {
        val out = ArrayList<Pair<AccessibilityWindowInfo?, AccessibilityNodeInfo>>()
        try {
            for (w in svc.windows) {
                if (w.type == AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY) continue
                val root = w.root ?: continue
                out.add(w to root)
            }
        } catch (_: Exception) {
        }
        if (out.isEmpty()) svc.rootInActiveWindow?.let { out.add(null to it) }
        return out
    }

    private inline fun walk(root: AccessibilityNodeInfo, visit: (AccessibilityNodeInfo) -> Unit) {
        val stack = ArrayDeque<AccessibilityNodeInfo>()
        stack.addLast(root)
        var seen = 0
        while (stack.isNotEmpty() && seen < 5_000) {
            val n = stack.removeLast()
            seen++
            visit(n)
            for (i in n.childCount - 1 downTo 0) {
                val c = try {
                    n.getChild(i)
                } catch (_: Exception) {
                    null
                }
                if (c != null) stack.addLast(c)
            }
        }
    }

    private fun allNodes(): Sequence<AccessibilityNodeInfo> = sequence {
        for ((_, root) in windowRoots()) {
            val list = ArrayList<AccessibilityNodeInfo>()
            walk(root) { list.add(it) }
            yieldAll(list)
        }
    }

    /** Места на экране, куда можно нажать, — для режима цифр. Порядок: сверху вниз, слева направо. */
    fun clickTargets(): List<Rect> {
        val size = screenSize()
        val screen = Rect(0, 0, size.x, size.y)
        val out = ArrayList<Rect>()
        // Окна приложений и клавиатура, лежащие выше, закрывают то, что под ними.
        val covers = ArrayList<Rect>()
        for ((window, root) in windowRoots()) {
            val found = ArrayList<Rect>()
            walk(root) { n ->
                if (!n.isVisibleToUser) return@walk
                if (!(n.isClickable || n.isLongClickable || n.isCheckable || n.isEditable)) return@walk
                val r = Rect()
                n.getBoundsInScreen(r)
                if (r.width() < 8 || r.height() < 8 || !r.intersect(screen)) return@walk
                if (covers.any { it.contains(r.centerX(), r.centerY()) }) return@walk
                if (found.none { it == r } && out.none { it == r }) found.add(r)
            }
            out.addAll(found)
            if (window != null && (window.type == AccessibilityWindowInfo.TYPE_APPLICATION ||
                    window.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD)
            ) {
                val b = Rect()
                window.getBoundsInScreen(b)
                if (!b.isEmpty) covers.add(b)
            }
            if (out.size >= 150) break
        }
        val row = maxOf(1, size.y / 40)
        return out.sortedWith(compareBy<Rect> { it.top / row }.thenBy { it.left }).take(150)
    }

    private fun label(n: AccessibilityNodeInfo): String? {
        val t = n.text?.toString()
        if (!t.isNullOrBlank()) return t
        val d = n.contentDescription?.toString()
        return if (d.isNullOrBlank()) null else d
    }

    private fun findByLabel(queries: List<String>): AccessibilityNodeInfo? =
        Match.best(queries, allNodes().filter { it.isVisibleToUser }.asIterable()) { label(it) }

    private fun click(node: AccessibilityNodeInfo, long: Boolean): Boolean {
        val action = if (long) AccessibilityNodeInfo.ACTION_LONG_CLICK else AccessibilityNodeInfo.ACTION_CLICK
        var n: AccessibilityNodeInfo? = node
        var depth = 0
        while (n != null && depth < 8) {
            if ((if (long) n.isLongClickable else n.isClickable) && n.performAction(action)) return true
            n = n.parent
            depth++
        }
        // Приложение не объявило кнопку нажимаемой — нажимаем «пальцем» в её центр.
        val r = Rect()
        node.getBoundsInScreen(r)
        return !r.isEmpty && tap(r.exactCenterX(), r.exactCenterY(), long)
    }

    fun clickText(text: String, long: Boolean = false): Boolean {
        val node = findByLabel(listOf(text)) ?: return false
        return click(node, long)
    }

    // ---------- ввод текста ----------

    private fun inputField(): AccessibilityNodeInfo? {
        svc.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)?.let { if (it.isEditable) return it }
        val field = allNodes().firstOrNull { it.isEditable && it.isVisibleToUser } ?: return null
        if (!field.performAction(AccessibilityNodeInfo.ACTION_FOCUS)) {
            field.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        }
        return field
    }

    private fun fieldText(n: AccessibilityNodeInfo): String {
        // У пароля вместо текста точки, у пустого поля — подсказка: дописывать к ним нельзя.
        if (n.isPassword) return ""
        if (Build.VERSION.SDK_INT >= 26 && n.isShowingHintText) return ""
        return n.text?.toString() ?: ""
    }

    private fun setText(n: AccessibilityNodeInfo, text: String): Boolean {
        val args = Bundle()
        args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        if (!n.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) return false
        val sel = Bundle()
        sel.putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, text.length)
        sel.putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, text.length)
        n.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, sel)
        return true
    }

    fun type(raw: String): Boolean {
        val field = inputField() ?: return false
        val old = fieldText(field)
        val new = Dictation.append(old, raw)
        if (setText(field, new)) return true
        // Запасной путь для полей, которые не дают заменить текст: вставка из буфера.
        return try {
            val piece = new.removePrefix(old)
            val cb = svc.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cb.setPrimaryClip(ClipData.newPlainText("vigil", piece))
            field.performAction(AccessibilityNodeInfo.ACTION_PASTE)
        } catch (_: Exception) {
            false
        }
    }

    fun deleteWord(): Boolean {
        val field = inputField() ?: return false
        return setText(field, Dictation.dropLastWord(fieldText(field)))
    }

    fun clearText(): Boolean {
        val field = inputField() ?: return false
        return setText(field, "")
    }

    fun enter(): Boolean {
        if (Build.VERSION.SDK_INT < 30) return false
        val field = svc.findFocus(AccessibilityNodeInfo.FOCUS_INPUT) ?: return false
        return field.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)
    }

    fun send(): Boolean {
        val button = findByLabel(listOf("отправить", "отправка", "send"))
        if (button != null && click(button, false)) return true
        return enter()
    }

    // ---------- приложения, поиск, звонки ----------

    private class App(val label: String, val pkg: String)

    private var apps: List<App> = emptyList()
    private var appsLoadedAt = 0L

    private fun launcherApps(): List<App> {
        val now = SystemClock.elapsedRealtime()
        if (apps.isNotEmpty() && now - appsLoadedAt < 60_000) return apps
        val pm = svc.packageManager
        val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        apps = pm.queryIntentActivities(intent, 0).map {
            App(it.loadLabel(pm).toString(), it.activityInfo.packageName)
        }
        appsLoadedAt = now
        return apps
    }

    private fun startActivity(intent: Intent): Boolean = try {
        svc.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (_: Exception) {
        false
    }

    /** Возвращает название запущенного приложения или null. */
    fun openApp(name: String): String? {
        val app = Match.best(Match.withAliases(name), launcherApps()) { it.label } ?: return null
        val intent = svc.packageManager.getLaunchIntentForPackage(app.pkg) ?: return null
        return if (startActivity(intent)) app.label else null
    }

    fun search(query: String): Boolean =
        startActivity(Intent(Intent.ACTION_WEB_SEARCH).putExtra(SearchManager.QUERY, query)) ||
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/search?q=" + Uri.encode(query))))

    private fun granted(permission: String) =
        svc.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    sealed class CallResult {
        data class Calling(val who: String) : CallResult()
        data object NoContactsPermission : CallResult()
        data object NotFound : CallResult()
        data object Failed : CallResult()
    }

    fun call(who: String): CallResult {
        val digits = who.filter { it.isDigit() }
        val isNumber = digits.length >= 3 && who.all { it.isDigit() || it == ' ' || it == '+' }
        val number: String
        val name: String
        if (isNumber) {
            number = (if (who.trimStart().startsWith("+")) "+" else "") + digits
            name = number
        } else {
            if (!granted(Manifest.permission.READ_CONTACTS)) return CallResult.NoContactsPermission
            val contact = findContact(who) ?: return CallResult.NotFound
            name = contact.first
            number = contact.second
        }
        val uri = Uri.fromParts("tel", number, null)
        val ok = if (granted(Manifest.permission.CALL_PHONE)) {
            startActivity(Intent(Intent.ACTION_CALL, uri))
        } else {
            // Без разрешения на звонки открываем набор номера — останется сказать «нажми вызов».
            startActivity(Intent(Intent.ACTION_DIAL, uri))
        }
        return if (ok) CallResult.Calling(name) else CallResult.Failed
    }

    private fun findContact(who: String): Pair<String, String>? {
        val list = ArrayList<Pair<String, String>>()
        try {
            svc.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                arrayOf(
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER,
                ),
                null, null, null,
            )?.use { c ->
                while (c.moveToNext()) {
                    val name = c.getString(0) ?: continue
                    val number = c.getString(1) ?: continue
                    list.add(name to number)
                }
            }
        } catch (_: Exception) {
            return null
        }
        return Match.best(listOf(who), list) { it.first }
    }

    fun answerCall(): Boolean {
        if (!granted(Manifest.permission.ANSWER_PHONE_CALLS)) return false
        val telecom = svc.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
        return try {
            @Suppress("DEPRECATION")
            telecom.acceptRingingCall()
            true
        } catch (_: Exception) {
            false
        }
    }

    fun hangUp(): Boolean {
        if (Build.VERSION.SDK_INT < 28 || !granted(Manifest.permission.ANSWER_PHONE_CALLS)) return false
        val telecom = svc.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
        return try {
            @Suppress("DEPRECATION")
            telecom.endCall()
        } catch (_: Exception) {
            false
        }
    }

    // ---------- звук, фонарик, справки ----------

    fun volume(up: Boolean) {
        val dir = if (up) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER
        repeat(2) { audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, dir, AudioManager.FLAG_SHOW_UI) }
    }

    fun mute(on: Boolean) {
        val dir = if (on) AudioManager.ADJUST_MUTE else AudioManager.ADJUST_UNMUTE
        audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, dir, AudioManager.FLAG_SHOW_UI)
    }

    fun media(key: MediaKey) {
        val code = when (key) {
            MediaKey.PLAY -> KeyEvent.KEYCODE_MEDIA_PLAY
            MediaKey.PAUSE -> KeyEvent.KEYCODE_MEDIA_PAUSE
            MediaKey.NEXT -> KeyEvent.KEYCODE_MEDIA_NEXT
            MediaKey.PREVIOUS -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
        }
        audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, code))
        audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, code))
    }

    fun flashlight(on: Boolean): Boolean {
        val cm = svc.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        return try {
            val id = cm.cameraIdList.firstOrNull {
                cm.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            } ?: return false
            cm.setTorchMode(id, on)
            true
        } catch (_: Exception) {
            false
        }
    }

    fun batteryPercent(): Int {
        val bm = svc.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }
}
