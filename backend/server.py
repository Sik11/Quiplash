"""
Local development server — replaces Azure Functions + Cosmos DB for demos.
Uses Flask for HTTP routing and TinyDB for local file-based storage.
All original Azure Function files are untouched and still deployable to Azure.

Run:
    pip install flask tinydb
    python server.py
"""

import os
import re
import sys
import json

from flask import Flask, request, jsonify
from tinydb import TinyDB, Query

# Make shared_code importable
sys.path.insert(0, os.path.dirname(__file__))
from shared_code.Player import (
    Player,
    SmallUsernameError, LargeUsernameError,
    SmallPasswordError, LargePasswordError,
)

app = Flask(__name__)

# TinyDB stores everything in a local JSON file
db = TinyDB('local_db.json')
players_table = db.table('players')
prompts_table = db.table('prompts')
P = Query()


# ── /player/login ────────────────────────────────────────────────────────────

@app.route('/player/login', methods=['GET', 'POST'])
def player_login():
    data = request.json or {}
    username = data.get('username')
    password = data.get('password')

    results = players_table.search(P.username == username)
    if results and results[0]['password'] == password:
        return jsonify({"result": True, "msg": "OK"})
    return jsonify({"result": False, "msg": "Username or password incorrect"})


# ── /player/register ─────────────────────────────────────────────────────────

@app.route('/player/register', methods=['POST'])
def player_register():
    data = request.json or {}
    input_player = Player()

    try:
        input_player.from_dict(data)
    except ValueError:
        return jsonify({"result": False, "msg": "Input JSON is not from a Player"})

    if players_table.search(P.username == input_player.username):
        return jsonify({"result": False, "msg": "Username already exists"})

    try:
        if input_player.is_valid():
            players_table.insert(input_player.to_dict())
            return jsonify({"result": True, "msg": "OK"})
    except (SmallUsernameError, LargeUsernameError):
        return jsonify({"result": False, "msg": "Username less than 4 characters or more than 14 characters"})
    except (SmallPasswordError, LargePasswordError):
        return jsonify({"result": False, "msg": "Password less than 10 characters or more than 20 characters"})


# ── /player/update ───────────────────────────────────────────────────────────

@app.route('/player/update', methods=['POST'])
def player_update():
    data = request.json or {}
    username = data.get('username')
    game_increment = data.get('add_to_games_played', 0)
    score_increment = data.get('add_to_score', 0)

    results = players_table.search(P.username == username)
    if not results:
        return jsonify({"result": False, "msg": "Player does not exist"})

    player = results[0]
    new_games = player['games_played'] + game_increment
    new_score = player['total_score'] + score_increment

    if new_games >= 0:
        players_table.update({'games_played': new_games}, P.username == username)
    if new_score >= 0:
        players_table.update({'total_score': new_score}, P.username == username)

    return jsonify({"result": True, "msg": "OK"})


# ── /prompt/create ───────────────────────────────────────────────────────────
# Translation is skipped locally — prompts are stored as English only.

@app.route('/prompt/create', methods=['POST'])
def prompt_create():
    data = request.json or {}
    username = data.get('username')
    text = str(data.get('text', ''))

    if not players_table.search(P.username == username):
        return jsonify({"result": False, "msg": "Player does not exist"})

    if len(text) < 15 or len(text) > 80:
        return jsonify({"result": False, "msg": "Prompt less than 15 characters or more than 80 characters"})

    prompts_table.insert({
        "username": username,
        "texts": [{"language": "en", "text": text}]
    })
    return jsonify({"result": True, "msg": "OK"})


# ── /prompt/delete ───────────────────────────────────────────────────────────

@app.route('/prompt/delete', methods=['DELETE'])
def prompt_delete():
    data = request.json or {}
    username = data.get('player')
    word = data.get('word')
    deleted = 0

    if username:
        deleted = len(prompts_table.search(P.username == username))
        prompts_table.remove(P.username == username)

    elif word:
        pattern = re.compile(r'\b' + re.escape(word) + r'\b', re.IGNORECASE)
        to_remove = []
        for p in prompts_table.all():
            for t in p.get('texts', []):
                if pattern.search(t.get('text', '')):
                    to_remove.append(p.doc_id)
                    break
        prompts_table.remove(doc_ids=to_remove)
        deleted = len(to_remove)

    return jsonify({"result": True, "msg": f"{deleted} prompts deleted"})


# ── /utils/get ───────────────────────────────────────────────────────────────

@app.route('/utils/get', methods=['GET'])
def utils_get():
    data = request.json or {}
    player_list = data.get('players', [])
    language = data.get('language', 'en')

    result = []
    for p in prompts_table.all():
        if p['username'] not in player_list:
            continue
        texts = p.get('texts', [])
        # Prefer requested language, fall back to English
        match = next((t for t in texts if t['language'] == language), None)
        if not match:
            match = next((t for t in texts if t['language'] == 'en'), None)
        if match:
            result.append({
                "id": str(p.doc_id),
                "text": match['text'],
                "username": p['username']
            })
    return jsonify(result)


# ── /leaderboard ─────────────────────────────────────────────────────────────

@app.route('/leaderboard', methods=['GET'])
def leaderboard():
    data = request.json or {}
    n = data.get('top', 10)

    all_players = players_table.all()
    sorted_players = sorted(
        all_players,
        key=lambda p: (-p['total_score'], p['games_played'], p['username'])
    )
    top_n = [
        {"username": p['username'], "games_played": p['games_played'], "total_score": p['total_score']}
        for p in sorted_players[:n]
    ]
    return jsonify(top_n)


# ── /health ──────────────────────────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"})


# ─────────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8181))
    print(f"\nLocal Quiplash backend running at http://localhost:{port}\n")
    app.run(host='0.0.0.0', port=port, debug=True, use_reloader=True)


