"""Testes das funções puras da Vertal Novela (rodam sem GPU):  python -m pytest infra/vertal-gpu-modal -q"""
import json

import pytest

from vertal_novela import build_ass, caption_chunks, motion_filter, parse_script, xfade_offsets


def test_parse_script_tolerates_fences_and_fixes_motion():
    cenas = [{"narracao": f"cena {i} " * 3, "imagem": "a woman baking", "movimento": "voar"} for i in range(10)]
    txt = "```json\n" + json.dumps({"titulo": "Bolo", "cenas": cenas}) + "\n```"
    d = parse_script(txt, 10)
    assert d["titulo"] == "Bolo" and len(d["cenas"]) == 10
    assert all(c["movimento"] == "zoom_in" for c in d["cenas"])


def test_parse_script_rejects_too_few_scenes():
    with pytest.raises(ValueError):
        parse_script(json.dumps({"cenas": [{"narracao": "x", "imagem": "y"}]}), 10)


def test_captions_and_ass_timing():
    assert caption_chunks("um dois tres quatro cinco seis sete") == ["um dois tres quatro cinco seis", "sete"]
    ass = build_ass([{"narracao": "um dois tres quatro cinco seis sete", "start": 1.0, "speech": 2.0}])
    assert "Dialogue: 0,0:00:01.00," in ass and ass.count("Dialogue:") == 2


def test_xfade_offsets_and_motion():
    assert xfade_offsets([10.0, 12.0, 8.0], 0.5) == [9.5, 21.0]
    assert "zoompan" in motion_filter("pan_esq", 240) and "d=240" in motion_filter("zoom_out", 240)


def test_script_words():
    from vertal_novela import script_words

    assert script_words({"cenas": [{"narracao": "a b c"}, {"narracao": "d e"}]}) == 5
