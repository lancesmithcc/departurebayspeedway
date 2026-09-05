#!/usr/bin/env python3
# make_voices.py — synthesize the game's voice lines with Kokoro (local ONNX TTS)
# Model files land in tools/kokoro/ (int8 quantized, ~80 MB, downloaded once).
import os
import sys
import json
import hashlib
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(HERE, "kokoro")
OUT_DIR = os.path.join(os.path.dirname(HERE), "audio", "voices")
MODEL = os.path.join(MODEL_DIR, "kokoro-v1.0.int8.onnx")
VOICES = os.path.join(MODEL_DIR, "voices-v1.0.bin")
BASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1"

# Kokoro ships no child voice. Rendering the lightest adult voices at 1/RATIO speed and
# resampling the result up by RATIO lands the pitch about a third higher with the
# original pace intact — which is a nine-year-old, near enough, and costs one numpy
# interpolation per line.
CHILD = {"pitch": 1.34}
# am_puck starts an octave below the others, so the one boy in the group needs more of
# a shift to land in the same room as them rather than reading as a small adult.
CHILD_BOY = {"pitch": 1.62}

LINES = [
    ('intro', 'am_michael', 'Well hey there, bud! Welcome to Departure Bay Speedway!'),
    ('intro2', 'am_michael', 'Country Club to the beach, pal! Keep the rubber side down, eh!'),
    ('sendit', 'am_michael', 'Hit that ramp, bud! Send it through the frickin fire!'),
    ('ring', 'am_michael', 'Dang bro! Right through the fire!'),
    ('finish', 'am_michael', 'Holy crap, bud! Made it to the beach! Beauty of a run, eh!'),
    ('crash1', 'bf_emma', 'Holy crap, bud! People drive wild around here!'),
    ('crash2', 'am_adam', 'What the heck, pal! Watch where you are going!'),
    ('crash3', 'af_bella', 'Aw shoot, bud! My insurance is not covering that!'),
    ('crash4', 'bm_george', 'Yikes, pal! The Mounties are gonna hear about this!'),
    ('crash5', 'af_nicole', 'Dang bro! Save the Nanaimo bars, bud!'),
    ('crash6', 'am_adam', 'Frickin heck! Who taught you to ride, bud?'),
    ('crash7', 'bf_emma', 'Watch it, pal! You nearly took me clean out!'),
    ('crash8', 'am_michael', 'Aw crap, bud! I just washed this thing!'),
    ('crash9', 'af_bella', 'Ooh shoot, man, you little bugger!'),
    ('crash10', 'bm_george', 'Right off the road, bud! What in the heck!'),
    ('ped1', 'af_nicole', 'A frikkin Nanaimo bar! You terd!'),
    ('ped2', 'bm_george', 'Holy crap, bud! Did you just throw dessert at me?'),
    ('ped3', 'af_bella', 'Aw shoot, pal! Custard right in my hair!'),
    ('ped4', 'am_adam', 'Easy, bud! Nanaimo bars belong on a plate!'),
    ('ped5', 'bf_emma', 'You little bugger! Chocolate all over my jacket!'),
    ('ped6', 'am_michael', 'Free Nanaimo bar, bud! Frick yeah, I will take it!'),
    ('school1', 'bf_emma', 'School zone, bud! Kids crossing! Slow it down, eh!'),
    ('kid1', 'af_sky', 'Holy crap, bud! My backpack went flying!', CHILD),
    ('kid2', 'af_nova', 'Yikes, pal! You better watch it!', CHILD),
    ('kid3', 'bf_lily', 'A frickin Nanaimo bar! Right in the face, eh!', CHILD),
    ('kid4', 'af_kore', 'Aw shoot, bud! That bike needs better brakes!', CHILD),
    ('kid5', 'am_puck', 'Dang bro! What in the heck!', CHILD_BOY),
    ('kid6', 'af_river', 'Easy there, pal! This is a school, eh!', CHILD),
    ('kid7', 'af_sky', 'Aw crap! My backpack survived, bud!', CHILD),
    ('kid8', 'af_nova', 'Ooh shoot! Chocolate in my hoodie, you bugger!', CHILD),
    ('kid9', 'bf_lily', 'Watch the crosswalk, pal! I am walking here!', CHILD),
    ('kid10', 'af_kore', 'Frickin heck, bud! That was a rough one!', CHILD),
    ('church1', 'am_michael', 'Pastor Jeremy says ride safe, bud! Keep it holy, eh!'),
    ('church_a1', 'af_bella', 'Bless you, bud! You missed my good side!'),
    ('church_a2', 'bf_emma', 'I forgive you, pal! Watch the frickin brakes though!'),
    ('church_a3', 'af_nicole', 'Dang bro! Those tires leave a mark!'),
    ('church_a4', 'bm_george', 'The Lord is my shepherd and my chiropractor, eh!'),
    ('church_a5', 'af_bella', 'No worries, bud! Take a Nanaimo bar for the road!'),
    ('church_a6', 'am_adam', 'Easy, pal! Turn the other cheek, not the bike!'),
    ('church_a7', 'bf_emma', 'Holy crap, bud! My casserole survived!'),
    ('church_a8', 'am_michael', 'Aw shoot! Needed a lie-down anyway, eh!'),
    ('church_d1', 'am_michael', 'Frickin heck, bud! Satan left tire tracks!'),
    ('church_d2', 'af_nicole', 'Aw crap, pal! Damned and flattened in one go!'),
    ('church_d3', 'bf_emma', 'Dang bro! The lawn is lava now, bud!'),
    ('church_d4', 'bm_george', 'Ride on, pal! Mind the frickin flames!'),
    ('church_d5', 'af_bella', 'Aw shoot, bud! The cursed bake sale is cancelled!'),
    ('church_d6', 'am_adam', 'Easy, pal! Hell has enough dents already!'),
    ('church_d7', 'af_nicole', 'Holy crap! Burnt casseroles, burnt souls, eh!'),
    ('church_d8', 'bm_george', 'Yikes, bud! Even the deacon needs bodywork!'),
    ('pow_beer1', 'am_michael', 'Frick yeah! Lucky beer, bud!'),
    ('pow_beer2', 'am_michael', 'A case of Lucky! Beauty, bud! Send it!'),
    ('pow_coffee1', 'am_michael', 'Double-double, bud! Frick yeah!'),
    ('pow_coffee2', 'am_michael', 'Oh beauty! Double-double! Now we are cooking, bud!'),
    ('pow_bars1', 'am_michael', 'Holy crap! A crate of Nanaimo bars, bud!'),
    ('pow_bars2', 'am_michael', 'Bar crate, pal! Let them have it, eh!'),
    ('pow_blessed1', 'am_michael', 'Blessed, bud! Frick yeah, you cannot bin it!'),
    ('pow_blessed2', 'am_michael', 'The congregation has your back, pal! Ride on, eh!'),
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

    import numpy as np

    source = open(os.path.join(os.path.dirname(HERE), 'src', 'dialogue-lines.js')).read()
    dialogue = json.loads(source.split('export default ', 1)[1].strip().rstrip(';'))
    extra = [(r['key'], r['voice'], r['text'], {'pitch': r.get('pitch', 1)}) for r in dialogue]
    entries = extra if '--dialogue-only' in sys.argv else LINES + extra
    manifest_path = os.path.join(OUT_DIR, 'generated-lines.json')
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
    for entry in entries:
        key, voice, text = entry[:3]
        opts = entry[3] if len(entry) > 3 else {}
        pitch = opts.get("pitch", 1.0)
        out = os.path.join(OUT_DIR, f"{key}.wav")
        source = {'text': text, 'voice': voice, 'pitch': pitch}
        previous = manifest.get(key, {})
        if (os.path.exists(out) and "--force" not in sys.argv
                and all(previous.get(k) == v for k, v in source.items())
                and previous.get('sha256') == hashlib.sha256(open(out, 'rb').read()).hexdigest()):
            print(f"skip {key} (verified render)")
            continue
        audio, sr = kokoro.create(text, voice=voice, speed=1.02 / pitch, lang="en-us")
        if pitch != 1.0:
            # resample shorter at the same sample rate: pitch and pace both go up by
            # `pitch`, and the slow render above is what puts the pace back
            n = max(1, int(len(audio) / pitch))
            audio = np.interp(
                np.linspace(0, len(audio) - 1, n), np.arange(len(audio)), audio,
            ).astype("float32")
        sf.write(out, audio, sr)
        manifest[key] = {**source, 'sha256': hashlib.sha256(open(out, 'rb').read()).hexdigest(),
                         'seconds': round(len(audio) / sr, 4), 'sampleRate': sr}
        # Save after every completed clip so an interrupted batch resumes safely.
        temporary = manifest_path + '.tmp'
        with open(temporary, 'w') as handle:
            json.dump(manifest, handle, indent=2)
        os.replace(temporary, manifest_path)
        print(f"{key}: {len(audio) / sr:.2f}s [{voice}{'' if pitch == 1.0 else f' +{pitch:.2f}x'}]")

    print("done:", OUT_DIR)


if __name__ == "__main__":
    main()
