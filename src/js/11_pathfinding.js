/* ================= pathfinding ================= */
// Поиск пути — по графу навигации мира (см. 02_map.js: buildNav, nearestNode, navPath).
// Обёртка для старого интерфейса тестов: путь между двумя точками мира.
function findPath(a, b) { return navPath(nearestNode(a), nearestNode(b)); }
