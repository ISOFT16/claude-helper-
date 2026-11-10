package com.isoft16.vigillauncher

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.MediaStore
import org.json.JSONArray
import org.json.JSONObject

/** Ярлык на главном экране или в док-панели. */
class HomeItem(
    val key: String,
    var container: Int,
    var page: Int,
    var x: Int,
    var y: Int,
)

/** Раскладка главного экрана; хранится в настройках приложения в виде JSON. */
class HomeStore(private val context: Context) {
    companion object {
        const val DESKTOP = 0
        const val DOCK = 1
    }

    private val prefs = context.getSharedPreferences("home", Context.MODE_PRIVATE)
    val items = ArrayList<HomeItem>()

    val initialized: Boolean
        get() = prefs.getBoolean("initialized", false)

    fun load() {
        items.clear()
        val text = prefs.getString("items", null) ?: return
        try {
            val array = JSONArray(text)
            for (i in 0 until array.length()) {
                val o = array.getJSONObject(i)
                items.add(
                    HomeItem(
                        o.getString("key"),
                        o.getInt("container"),
                        o.getInt("page"),
                        o.getInt("x"),
                        o.getInt("y"),
                    )
                )
            }
        } catch (e: Exception) {
            items.clear()
        }
    }

    fun save() {
        val array = JSONArray()
        for (item in items) {
            array.put(
                JSONObject()
                    .put("key", item.key)
                    .put("container", item.container)
                    .put("page", item.page)
                    .put("x", item.x)
                    .put("y", item.y)
            )
        }
        prefs.edit().putString("items", array.toString()).putBoolean("initialized", true).apply()
    }

    fun itemAt(container: Int, page: Int, x: Int, y: Int): HomeItem? =
        items.firstOrNull {
            it.container == container && it.x == x && it.y == y &&
                (container == DOCK || it.page == page)
        }

    /** Верхняя строка первого экрана занята виджетом с датой. */
    private fun reserved(container: Int, page: Int, y: Int): Boolean =
        container == DESKTOP && page == 0 && y == 0

    fun isFree(container: Int, page: Int, x: Int, y: Int, cols: Int, rows: Int): Boolean {
        if (x < 0 || x >= cols) return false
        if (container == DOCK) {
            if (y != 0) return false
        } else if (y < 0 || y >= rows || page < 0) {
            return false
        }
        if (reserved(container, page, y)) return false
        return itemAt(container, page, x, y) == null
    }

    fun pageCount(): Int {
        var max = 0
        for (item in items) {
            if (item.container == DESKTOP && item.page > max) max = item.page
        }
        return max + 1
    }

    /** Первая свободная ячейка рабочего стола, начиная с указанного экрана. */
    fun firstFreeDesktop(startPage: Int, cols: Int, rows: Int): IntArray {
        var page = startPage.coerceAtLeast(0)
        while (true) {
            for (y in 0 until rows) {
                for (x in 0 until cols) {
                    if (isFree(DESKTOP, page, x, y, cols, rows)) return intArrayOf(page, x, y)
                }
            }
            page++
        }
    }

    /** Свободная ячейка на том же экране, ближайшая к указанной. */
    fun nearestFree(container: Int, page: Int, x: Int, y: Int, cols: Int, rows: Int): IntArray? {
        var best: IntArray? = null
        var bestDistance = Int.MAX_VALUE
        val maxY = if (container == DOCK) 1 else rows
        for (cy in 0 until maxY) {
            for (cx in 0 until cols) {
                if (!isFree(container, page, cx, cy, cols, rows)) continue
                val distance = (cx - x) * (cx - x) + (cy - y) * (cy - y)
                if (distance < bestDistance) {
                    bestDistance = distance
                    best = intArrayOf(cx, cy)
                }
            }
        }
        return best
    }

    /** Убирает ярлыки удалённых приложений. Возвращает true, если что-то изменилось. */
    fun prune(validKeys: Set<String>): Boolean = items.removeAll { it.key !in validKeys }

    /** Убирает пустые экраны между занятыми. */
    fun compactPages() {
        val used = sortedSetOf(0)
        for (item in items) if (item.container == DESKTOP) used.add(item.page)
        val remap = HashMap<Int, Int>()
        used.forEachIndexed { index, page -> remap[page] = index }
        for (item in items) {
            if (item.container == DESKTOP) item.page = remap[item.page] ?: item.page
        }
    }

    /** Переставляет ярлыки, которые не помещаются в сетку или накладываются друг на друга. */
    fun normalize(cols: Int, rows: Int) {
        val all = ArrayList(items)
        items.clear()
        val misplaced = ArrayList<HomeItem>()
        for (item in all) {
            if (item.container == DOCK) item.page = 0
            if (isFree(item.container, item.page, item.x, item.y, cols, rows)) {
                items.add(item)
            } else {
                misplaced.add(item)
            }
        }
        for (item in misplaced) {
            if (item.container == DOCK) {
                val x = (0 until cols).firstOrNull { isFree(DOCK, 0, it, 0, cols, rows) }
                if (x != null) {
                    item.x = x
                    item.y = 0
                    items.add(item)
                    continue
                }
                item.container = DESKTOP
            }
            val cell = firstFreeDesktop(item.page, cols, rows)
            item.page = cell[0]
            item.x = cell[1]
            item.y = cell[2]
            items.add(item)
        }
        compactPages()
    }

    /** Первая раскладка: телефон, сообщения, браузер и камера в доке, несколько приложений над ним. */
    fun populateDefaults(apps: List<AppEntry>, cols: Int, rows: Int) {
        items.clear()
        val pm = context.packageManager
        val used = HashSet<String>()

        fun packageFor(intent: Intent): String? = try {
            pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName
        } catch (e: Exception) {
            null
        }

        fun appFor(packageName: String?): AppEntry? {
            if (packageName == null) return null
            return apps.firstOrNull { it.component.packageName == packageName && it.key !in used }
        }

        val dockIntents = listOf(
            Intent(Intent.ACTION_DIAL),
            Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:")),
            Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")),
            Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA),
        )
        var x = 0
        for (intent in dockIntents) {
            if (x >= cols) break
            val app = appFor(packageFor(intent)) ?: continue
            used.add(app.key)
            items.add(HomeItem(app.key, DOCK, 0, x++, 0))
        }

        val desktopPackages = listOf(
            "com.android.vending",
            "com.google.android.gm",
            "com.google.android.apps.photos",
            "com.google.android.youtube",
            "com.google.android.apps.maps",
            "com.android.settings",
        )
        x = 0
        for (packageName in desktopPackages) {
            if (x >= cols) break
            val app = appFor(packageName) ?: continue
            used.add(app.key)
            items.add(HomeItem(app.key, DESKTOP, 0, x++, rows - 1))
        }
        save()
    }
}
