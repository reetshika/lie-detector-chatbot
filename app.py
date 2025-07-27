from flask import Flask, request, jsonify, session, send_from_directory
import os, tempfile, re
import openai
from dotenv import load_dotenv

load_dotenv()
client = openai.OpenAI()

app = Flask(__name__, static_folder="static", static_url_path="")
app.secret_key = os.urandom(24)

# Expanded trigger list
LIE_TRIGGERS = [
    "to be honest","honestly","trust me","i swear","believe me",
    "no doubt","seriously","i promise","frankly speaking","truthfully"
]

def heuristic_score(text: str) -> float:
    t = text.lower()
    # 1 point per trigger phrase
    score = sum(t.count(kw) for kw in LIE_TRIGGERS)

    # simple contradiction bonus
    history = session.get("statements", [])
    for prev in history:
        if ("always" in prev and "never" in t) or ("never" in prev and "always" in t):
            score += 2

    # count filler words
    score += len(re.findall(r"\b(um+|uh+|like)\b", t)) * 0.5

    history.append(t)
    session["statements"] = history[-10:]
    return score

def gpt_score(text: str) -> float:
    prompt = (
        f"Rate the likelihood that the following statement is a LIE, "
        f"on a scale from 0.0 (definitely truthful) to 1.0 (definitely lying). "
        f"Answer only with a decimal number.\n\n"
        f"Statement: \"{text}\""
    )
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a truthfulness classifier."},
            {"role": "user",   "content": prompt}
        ]
    )
    raw = resp.choices[0].message.content.strip()
    try:
        return max(0.0, min(1.0, float(raw)))
    except:
        return 0.5

@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")

@app.route("/transcribe", methods=["POST"])
def transcribe():
    audio = request.files.get("audio")
    if not audio:
        return jsonify(error="no audio"), 400

    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        audio.save(tmp.name)
        path = tmp.name

    resp = client.audio.transcriptions.create(
        file=open(path, "rb"),
        model="whisper-1"
    )
    os.unlink(path)

    text = resp.text
    h = heuristic_score(text)
    g = gpt_score(text)
    final = min(1.0, (h/5) * 0.3 + g * 0.7)

    filler_cnt = len(re.findall(r"\b(um+|uh+|like)\b", text.lower()))
    final = min(1.0, final + 0.06 * min(filler_cnt, 5))

    app.logger.info(f"[LIE_SCORE] h={h:.1f}, g={g:.2f}, f={filler_cnt} → final={final:.2f}")
    return jsonify(text=text, score=final)

@app.route("/chat", methods=["POST"])
def chat():
    data     = request.get_json()
    user_msg = data.get("text", "")

    filler_cnt = len(re.findall(r"\b(um+|uh+|like)\b", user_msg.lower()))

    h = heuristic_score(user_msg)
    g = gpt_score(user_msg)
    final = min(1.0, (h/5) * 0.3 + g * 0.7)
    final = min(1.0, final + 0.06 * min(filler_cnt, 5))

    app.logger.info(f"[LIE_SCORE] h={h:.1f}, g={g:.2f}, f={filler_cnt} → final={final:.2f}")

    conv = [
        {"role": "system", "content": "You are a helpful lie‑detector assistant."},
        {"role": "user",   "content": user_msg}
    ]
    res = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=conv
    )
    reply = res.choices[0].message.content

    return jsonify(reply=reply, score=final)

if __name__ == "__main__":
    app.run(debug=True)
