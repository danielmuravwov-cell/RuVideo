"""
RuVideo — видеохостинг: файлы, лайки, подписки, студия с комментариями.
Запуск:  python server.py  →  http://127.0.0.1:5000
"""
import os
import re
import sqlite3
import uuid
from functools import wraps

from flask import Flask, request, jsonify, session, send_file, g
from werkzeug.security import generate_password_hash, check_password_hash

BASE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE, 'ruvideo.db')
UPLOAD_DIR = os.path.join(BASE, 'static', 'uploads')
ALLOWED_VIDEO = {'mp4', 'webm', 'ogg', 'mov'}
ALLOWED_IMAGE = {'jpg', 'jpeg', 'png', 'webp', 'gif'}

os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__)
app.secret_key = 'замените-на-длинную-случайную-строку'
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 ** 3   # 2 ГБ


# ────────────────────── база данных ──────────────────────

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA foreign_keys = ON')
    return g.db


@app.teardown_appcontext
def close_db(_):
    db = g.pop('db', None)
    if db is not None:
        db.close()


def init_db():
    with sqlite3.connect(DB_PATH) as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created  TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS videos (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            description TEXT DEFAULT '',
            filename    TEXT NOT NULL,
            views       INTEGER DEFAULT 0,
            created     TEXT DEFAULT (datetime('now')),
            user_id     INTEGER NOT NULL REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS likes (
            user_id  INTEGER NOT NULL REFERENCES users(id),
            video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
            value    INTEGER NOT NULL,
            PRIMARY KEY (user_id, video_id)
        );
        CREATE TABLE IF NOT EXISTS comments (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            text     TEXT NOT NULL,
            created  TEXT DEFAULT (datetime('now')),
            user_id  INTEGER NOT NULL REFERENCES users(id),
            video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS subs (
            subscriber_id INTEGER NOT NULL REFERENCES users(id),
            channel_id    INTEGER NOT NULL REFERENCES users(id),
            PRIMARY KEY (subscriber_id, channel_id)
        );
        ''')
        # мягкие миграции для старых баз
        ucols = [r[1] for r in db.execute('PRAGMA table_info(users)')]
        if 'avatar' not in ucols:
            db.execute("ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''")
        vcols = [r[1] for r in db.execute('PRAGMA table_info(videos)')]
        if 'source' not in vcols:
            db.execute("ALTER TABLE videos ADD COLUMN source TEXT DEFAULT ''")


# ────────────────────── помощники ──────────────────────

def me():
    uid = session.get('uid')
    if not uid:
        return None
    return get_db().execute('SELECT * FROM users WHERE id = ?', (uid,)).fetchone()


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not session.get('uid'):
            return jsonify(error='Сначала войдите'), 401
        return fn(*args, **kwargs)
    return wrapper


def avatar_url(name):
    return f'/static/uploads/{name}' if name else ''


def public_user(u):
    return {'id': u['id'], 'username': u['username'], 'avatar': avatar_url(u['avatar'])}


def video_row(row):
    db = get_db()
    vid = row['id']
    likes = db.execute('SELECT COUNT(*) FROM likes WHERE video_id=? AND value=1', (vid,)).fetchone()[0]
    comments = db.execute('SELECT COUNT(*) FROM comments WHERE video_id=?', (vid,)).fetchone()[0]
    author = db.execute('SELECT username, avatar FROM users WHERE id=?', (row['user_id'],)).fetchone()
    my = 0
    if session.get('uid'):
        r = db.execute('SELECT value FROM likes WHERE video_id=? AND user_id=?',
                       (vid, session['uid'])).fetchone()
        my = r['value'] if r else 0
    return {
        'id': vid, 'title': row['title'], 'description': row['description'],
        'src': f"/static/uploads/{row['filename']}",
        'views': row['views'], 'created': row['created'],
        'author': author['username'], 'author_avatar': avatar_url(author['avatar']),
        'likes': likes, 'comments': comments, 'my': my,
        'source': row['source'],
        'mine': session.get('uid') == row['user_id'],
    }


# ────────────────────── страница ──────────────────────

@app.route('/')
def index():
    return send_file('index.html')


# ────────────────────── авторизация ──────────────────────

@app.post('/api/register')
def register():
    d = request.get_json(silent=True) or {}
    username = (d.get('username') or '').strip()
    password = d.get('password') or ''
    if not re.fullmatch(r'[A-Za-z0-9_]{3,30}', username):
        return jsonify(error='Ник: 3–30 символов — латиница, цифры и «_»'), 400
    if len(password) < 6:
        return jsonify(error='Пароль — минимум 6 символов'), 400
    db = get_db()
    if db.execute('SELECT id FROM users WHERE username=?', (username,)).fetchone():
        return jsonify(error='Этот ник уже занят'), 400
    cur = db.execute('INSERT INTO users (username, password) VALUES (?,?)',
                     (username, generate_password_hash(password)))
    db.commit()
    session['uid'] = cur.lastrowid
    return jsonify(user=public_user(me()))


@app.post('/api/login')
def login():
    d = request.get_json(silent=True) or {}
    u = get_db().execute('SELECT * FROM users WHERE username=?',
                         ((d.get('username') or '').strip(),)).fetchone()
    if not u or not check_password_hash(u['password'], d.get('password') or ''):
        return jsonify(error='Неверный ник или пароль'), 400
    session['uid'] = u['id']
    return jsonify(user=public_user(u))


@app.post('/api/logout')
def logout():
    session.pop('uid', None)
    return jsonify(ok=True)


@app.get('/api/me')
def api_me():
    u = me()
    return jsonify(user=public_user(u) if u else None)


@app.post('/api/avatar')
@login_required
def upload_avatar():
    f = request.files.get('avatar')
    if not f or not f.filename:
        return jsonify(error='Выберите картинку'), 400
    ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
    if ext not in ALLOWED_IMAGE:
        return jsonify(error='Только jpg, png, webp или gif'), 400
    name = f'ava_{uuid.uuid4().hex}.{ext}'
    f.save(os.path.join(UPLOAD_DIR, name))
    db = get_db()
    old = me()['avatar']
    if old:
        p = os.path.join(UPLOAD_DIR, old)
        if os.path.exists(p):
            os.remove(p)
    db.execute('UPDATE users SET avatar=? WHERE id=?', (name, session['uid']))
    db.commit()
    return jsonify(avatar=avatar_url(name))


# ────────────────────── каналы и подписки ──────────────────────

@app.get('/api/channel/<username>')
def channel(username):
    db = get_db()
    u = db.execute('SELECT id, username, avatar FROM users WHERE username=?', (username,)).fetchone()
    if not u:
        return jsonify(error='Канал не найден'), 404
    subs = db.execute('SELECT COUNT(*) FROM subs WHERE channel_id=?', (u['id'],)).fetchone()[0]
    subscribed = False
    if session.get('uid'):
        subscribed = bool(db.execute(
            'SELECT 1 FROM subs WHERE subscriber_id=? AND channel_id=?',
            (session['uid'], u['id'])).fetchone())
    return jsonify(username=u['username'], avatar=avatar_url(u['avatar']),
                   subscribers=subs, subscribed=subscribed)


@app.post('/api/channel/<username>/subscribe')
@login_required
def subscribe(username):
    db = get_db()
    u = db.execute('SELECT id FROM users WHERE username=?', (username,)).fetchone()
    if not u:
        return jsonify(error='Канал не найден'), 404
    if u['id'] == session['uid']:
        return jsonify(error='Нельзя подписаться на себя'), 400
    row = db.execute('SELECT 1 FROM subs WHERE subscriber_id=? AND channel_id=?',
                     (session['uid'], u['id'])).fetchone()
    if row:
        db.execute('DELETE FROM subs WHERE subscriber_id=? AND channel_id=?',
                   (session['uid'], u['id']))
        subscribed = False
    else:
        db.execute('INSERT INTO subs (subscriber_id, channel_id) VALUES (?,?)',
                   (session['uid'], u['id']))
        subscribed = True
    db.commit()
    subs = db.execute('SELECT COUNT(*) FROM subs WHERE channel_id=?', (u['id'],)).fetchone()[0]
    return jsonify(subscribed=subscribed, subscribers=subs)


# ────────────────────── видео ──────────────────────

@app.get('/api/videos')
def api_videos():
    q = request.args.get('q', '').strip()
    db = get_db()
    if q:
        rows = db.execute('SELECT * FROM videos WHERE title LIKE ? OR description LIKE ? '
                          'ORDER BY views DESC', (f'%{q}%', f'%{q}%')).fetchall()
    else:
        rows = db.execute('SELECT * FROM videos ORDER BY id DESC').fetchall()
    return jsonify(videos=[video_row(r) for r in rows])


@app.post('/api/videos')
@login_required
def upload_video():
    title = (request.form.get('title') or '').strip()
    desc = (request.form.get('description') or '').strip()
    f = request.files.get('video')
    if not title:
        print('[ЭФИР] ✗ Отклонено: пустое название')
        return jsonify(error='Введите название'), 400
    if not f or not f.filename:
        print('[ЭФИР] ✗ Отклонено: файл не выбран')
        return jsonify(error='Выберите видеофайл'), 400
    ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
    if ext not in ALLOWED_VIDEO:
        print(f'[ЭФИР] ✗ Отклонено: формат .{ext} не поддерживается')
        return jsonify(error='Только mp4, webm, ogg или mov'), 400

    name = f'{uuid.uuid4().hex}.{ext}'
    print(f'[ЭФИР] Принято: "{title}" ({f.filename}) → сохраняем как {name} …')
    try:
        f.save(os.path.join(UPLOAD_DIR, name))
    except Exception as e:
        print('[ЭФИР] ✗ ОШИБКА сохранения файла:', e)
        return jsonify(error=f'Не удалось сохранить файл: {e}'), 500

    db = get_db()
    cur = db.execute('INSERT INTO videos (title, description, filename, user_id) VALUES (?,?,?,?)',
                     (title, desc, name, session['uid']))
    db.commit()
    print(f'[ЭФИР] ✓ Видео сохранено! id={cur.lastrowid}')
    return jsonify(id=cur.lastrowid), 201


@app.get('/api/videos/<int:vid>')
def one_video(vid):
    row = get_db().execute('SELECT * FROM videos WHERE id=?', (vid,)).fetchone()
    if not row:
        return jsonify(error='Видео не найдено'), 404
    return jsonify(video=video_row(row))


@app.post('/api/videos/<int:vid>/view')
def add_view(vid):
    db = get_db()
    db.execute('UPDATE videos SET views = views + 1 WHERE id=?', (vid,))
    db.commit()
    return jsonify(ok=True)


@app.post('/api/videos/<int:vid>/rate')
@login_required
def rate(vid):
    action = (request.get_json(silent=True) or {}).get('action')
    if action not in ('like', 'dislike'):
        return jsonify(error='Некорректное действие'), 400
    value = 1 if action == 'like' else -1
    db = get_db()
    row = db.execute('SELECT value FROM likes WHERE user_id=? AND video_id=?',
                     (session['uid'], vid)).fetchone()
    if row and row['value'] == value:
        db.execute('DELETE FROM likes WHERE user_id=? AND video_id=?', (session['uid'], vid))
        my = 0
    elif row:
        db.execute('UPDATE likes SET value=? WHERE user_id=? AND video_id=?',
                   (value, session['uid'], vid))
        my = value
    else:
        db.execute('INSERT INTO likes (user_id, video_id, value) VALUES (?,?,?)',
                   (session['uid'], vid, value))
        my = value
    db.commit()
    likes = db.execute('SELECT COUNT(*) FROM likes WHERE video_id=? AND value=1',
                       (vid,)).fetchone()[0]
    return jsonify(likes=likes, my=my)


@app.delete('/api/videos/<int:vid>')
@login_required
def delete_video(vid):
    db = get_db()
    row = db.execute('SELECT * FROM videos WHERE id=?', (vid,)).fetchone()
    if not row:
        return jsonify(error='Видео не найдено'), 404
    if row['user_id'] != session['uid']:
        return jsonify(error='Это не ваше видео'), 403
    db.execute('DELETE FROM videos WHERE id=?', (vid,))
    db.commit()
    path = os.path.join(UPLOAD_DIR, row['filename'])
    if os.path.exists(path):
        os.remove(path)
    return jsonify(ok=True)


# ────────────────────── комментарии ──────────────────────

@app.get('/api/videos/<int:vid>/comments')
def list_comments(vid):
    rows = get_db().execute('''
        SELECT c.id, c.text, c.created, u.username, u.avatar
        FROM comments c JOIN users u ON u.id = c.user_id
        WHERE c.video_id = ? ORDER BY c.id DESC''', (vid,)).fetchall()
    return jsonify(comments=[
        {'id': r['id'], 'text': r['text'], 'created': r['created'],
         'username': r['username'], 'avatar': avatar_url(r['avatar'])}
        for r in rows])


@app.post('/api/videos/<int:vid>/comments')
@login_required
def add_comment(vid):
    text = ((request.get_json(silent=True) or {}).get('text') or '').strip()
    if not text or len(text) > 2000:
        return jsonify(error='Комментарий пустой или длиннее 2000 символов'), 400
    db = get_db()
    db.execute('INSERT INTO comments (text, user_id, video_id) VALUES (?,?,?)',
               (text, session['uid'], vid))
    db.commit()
    return jsonify(ok=True), 201


# ────────────────────── студия (аналитика + комментарии) ──────────────────────

@app.get('/api/studio')
@login_required
def studio():
    db = get_db()
    uid = session['uid']
    totals = db.execute('SELECT COUNT(*) AS videos, COALESCE(SUM(views),0) AS views '
                        'FROM videos WHERE user_id=?', (uid,)).fetchone()
    likes = db.execute('SELECT COUNT(*) FROM likes l JOIN videos v ON v.id=l.video_id '
                       'WHERE v.user_id=? AND l.value=1', (uid,)).fetchone()[0]
    comments_count = db.execute('SELECT COUNT(*) FROM comments c JOIN videos v ON v.id=c.video_id '
                                'WHERE v.user_id=?', (uid,)).fetchone()[0]
    subs = db.execute('SELECT COUNT(*) FROM subs WHERE channel_id=?', (uid,)).fetchone()[0]
    per = db.execute('''
        SELECT v.id, v.title, v.views, v.created,
               (SELECT COUNT(*) FROM likes l WHERE l.video_id=v.id AND l.value=1) AS likes,
               (SELECT COUNT(*) FROM comments c WHERE c.video_id=v.id) AS comments
        FROM videos v WHERE v.user_id=? ORDER BY v.views DESC''', (uid,)).fetchall()
    recent_comments = db.execute('''
        SELECT c.id, c.text, c.created,
               u.username AS author, u.avatar AS author_avatar,
               v.id AS video_id, v.title AS video_title
        FROM comments c
        JOIN users u ON u.id = c.user_id
        JOIN videos v ON v.id = c.video_id
        WHERE v.user_id = ?
        ORDER BY c.id DESC LIMIT 50''', (uid,)).fetchall()
    return jsonify(
        videos=totals['videos'], views=totals['views'], likes=likes,
        comments=comments_count, subscribers=subs,
        items=[dict(r) for r in per],
        comments_list=[{
            'id': r['id'], 'text': r['text'], 'created': r['created'],
            'author': r['author'], 'author_avatar': avatar_url(r['author_avatar']),
            'video_id': r['video_id'], 'video_title': r['video_title'],
        } for r in recent_comments])


@app.errorhandler(413)
def too_large(_):
    return jsonify(error='Файл больше 2 ГБ'), 413


init_db()

if __name__ == '__main__':
    app.run(debug=True, port=5000)