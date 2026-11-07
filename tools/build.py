#!/usr/bin/env python3
"""Собирает index.html из src/: стили, разметка и JS-модули склеиваются в один файл,
чтобы игру можно было открыть двойным щелчком (ES-модули из file:// браузеры не грузят)."""
import glob, os, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(root, 'src')
css = open(os.path.join(src, 'style.css'), encoding='utf-8').read()
body = open(os.path.join(src, 'body.html'), encoding='utf-8').read()
js = ''.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(os.path.join(src, 'js', '*.js'))))
# звуки интерфейса из assets/sounds встраиваются в страницу как base64 (работает и из file://, и в APK)
import base64, json
snd = {os.path.splitext(os.path.basename(f))[0]: base64.b64encode(open(f, 'rb').read()).decode()
       for f in sorted(glob.glob(os.path.join(root, 'assets', 'sounds', '*.mp3')))}
js = 'const UI_SOUND_DATA = ' + json.dumps(snd) + ';\n' + js
html = f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>Перехват — 3D-шутер</title>
<!-- Сгенерировано tools/build.py из src/. Правьте файлы в src/, а не этот файл. -->
<style>
{css}</style>
</head>
<body>
{body}<script type="importmap">{{"imports":{{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}}}</script>
<script type="module">
{js}</script>
</body>
</html>
'''
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(html)
print('index.html:', len(html.splitlines()), 'строк')
