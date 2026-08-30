#!/usr/bin/env python3
# make_voices.py — synthesize the game's voice lines with Kokoro (local ONNX TTS)
# Model files land in tools/kokoro/ (int8 quantized, ~80 MB, downloaded once).
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(HERE, "kokoro")
OUT_DIR = os.path.join(os.path.dirname(HERE), "audio", "voices")
MODEL = os.path.join(MODEL_DIR, "kokoro-v1.0.int8.onnx")
VOICES = os.path.join(MODEL_DIR, "voices-v1.0.bin")
BASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1"

LINES = [
    # key, voice, text
    ("intro", "am_michael", "Welcome to Departure Bay Speedway, punks!"),
    ("intro2", "am_michael", "Circle K to the beach. Try to keep it on two wheels."),
    ("sendit", "am_michael", "Hit the ramp! Send it through the rings of fire!"),
    ("ring", "am_michael", "Yeehaw! Through the fire!"),
    ("finish", "am_michael", "Mission passed, baby! Mad respect, my guy."),
    ("crash1", "bf_emma", "I can't believe how people drive in this town."),
    ("crash2", "am_adam", "What the heck? Get off the road, you maniac!"),
    ("crash3", "af_bella", "My insurance is NOT covering this!"),
    ("crash4", "bm_george", "That's it, I'm calling the cops!"),
    ("crash5", "af_nicole", "Not the Nanaimo bars! Anything but the Nanaimo bars!"),
    ("crash6", "am_adam", "Who taught you how to ride?!"),
    ("crash7", "bf_emma", "Watch where you're going, you lunatic!"),
    ("crash8", "am_michael", "I just had this thing washed!"),
    ("crash9", "af_bella", "Unbelievable. Every single day on this road."),
    ("crash10", "bm_george", "Right off the road! Who does that?"),
    # pedestrians wearing a Nanaimo bar
    ("ped1", "af_nicole", "Hey! That was my good jacket!"),
    ("ped2", "bm_george", "Did that lunatic just throw dessert at me?"),
    ("ped3", "af_bella", "Oh my god, it's in my hair!"),
    ("ped4", "am_adam", "Slow down, this is a school zone!"),
    ("ped5", "bf_emma", "Honestly, the youth of today."),
    ("ped6", "am_michael", "Free Nanaimo bar! I'm not even mad."),
    # crossing guard / school zone
    ("school1", "bf_emma", "School zone! Kids crossing, slow down!"),
    ("church1", "am_michael", "Pastor Jeremy says: ride safe, punks."),
    # pickups — the announcer calls every one of them, two lines apiece so a run
    # with four cases of Lucky in it does not repeat the same take
    ("pow_beer1", "am_michael", "Frick yeah! Lucky beer, bud!"),
    ("pow_beer2", "am_michael", "A case of Lucky! Frick yeah, send it, bud!"),
    ("pow_coffee1", "am_michael", "Double-double, bud! Frick yeah!"),
    ("pow_coffee2", "am_michael", "Oh, that's a double-double! Now we're cooking, bud!"),
    ("pow_bars1", "am_michael", "A whole crate of Nanaimo bars! Frick yeah!"),
    ("pow_bars2", "am_michael", "Bar crate, bud! Let 'em have it!"),
    ("pow_blessed1", "am_michael", "Blessed, bud! Frick yeah, you cannot bin it!"),
    ("pow_blessed2", "am_michael", "The congregation's got you now! Ride on, punk!"),
]


def fetch(url, dest):
    print(f"downloading {os.path.basename(url)} …")
    urllib.request.urlretrieve(url, dest)


def main():
    os.makedirs(MODEL_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    if not os.path.exists(MODEL):
        fetch(f"{BASE}/kokoro-v1.0.int8.onnx", MODEL)
    if not os.path.exists(VOICES):
        fetch(f"{BASE}/voices-v1.0.bin", VOICES)

    import soundfile as sf
    from kokoro_onnx import Kokoro
    kokoro = Kokoro(MODEL, VOICES)

    for key, voice, text in LINES:
        out = os.path.join(OUT_DIR, f"{key}.wav")
        if os.path.exists(out) and "--force" not in sys.argv:
            print(f"skip {key} (exists)")
            continue
        audio, sr = kokoro.create(text, voice=voice, speed=1.02, lang="en-us")
        sf.write(out, audio, sr)
        print(f"{key}: {len(audio) / sr:.2f}s [{voice}]")

    print("done:", OUT_DIR)


if __name__ == "__main__":
    main()
