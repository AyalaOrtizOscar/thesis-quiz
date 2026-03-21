#!/usr/bin/env python3
"""
parse_remnote.py
================
Parsea el export de RemNote (Markdown) y genera questions.json
para la PWA de aprendizaje.

Formato RemNote detectado:
  - Q↔A  = bidireccional
  - Q→A  = unidireccional
  - Q::A = definicion
  - Q:>A = respuesta corta (true/false)
  - Q;;A = respuesta larga
  - Q;-A = respuesta con referencia

Uso:
  python parse_remnote.py /tmp/remnote_export
"""

import json
import re
import sys
from pathlib import Path

EXPORT_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/remnote_export")
OUTPUT = Path(__file__).parent / "data" / "questions.json"

# Categorias por archivo
FILE_CATEGORIES = {
    "PREGUNTAS.md": {"category": "ML y Audio", "tags": ["ml", "audio", "python", "tesis"]},
    "Preguntas teoricas.md": {"category": "Hidraulica", "tags": ["hidraulica", "ingenieria"]},
    "Preguntas teoricas PARKER.md": {"category": "Hidraulica Parker", "tags": ["hidraulica", "parker"]},
    "Preguntas de figuras, ecuaciones y tablas.md": {"category": "Manufactura", "tags": ["manufactura", "ecuaciones", "corte"]},
    "Tesis de grado anterior.md": {"category": "Tesis Referencia", "tags": ["tesis", "audio", "desgaste"]},
    "A Tool Condition Monitoring System Based on Low-Cost.md": {"category": "Paper TCM", "tags": ["paper", "iot", "monitoreo"]},
    "PRIMER CORTE.md": {"category": "Frances", "tags": ["frances", "idioma"]},
    "PRIMER CORTE (1).md": {"category": "Frances", "tags": ["frances", "idioma"]},
    "21.1 Panorama general de la tecnología del maquinado.md": {"category": "Manufactura", "tags": ["manufactura", "maquinado"]},
    "22.1 Torneado y operaciones afines.md": {"category": "Manufactura", "tags": ["manufactura", "torneado"]},
}

# Separadores de flashcards RemNote
SEPARATORS = [
    ("↔", "bidirectional"),
    ("→", "unidirectional"),
    ("::", "definition"),
    (":>", "short_answer"),
    (";;", "long_answer"),
    (";-", "reference"),
    ("―", "unidirectional"),  # em dash variant
]


def clean_text(text):
    """Limpia texto de markdown artifacts."""
    text = text.strip()
    text = re.sub(r'^\s*-\s*', '', text)  # remove leading bullet
    text = re.sub(r'^\s*Pregunta\s*\d*:\s*', '', text)  # remove "Pregunta N:"
    text = re.sub(r'^\s*Pregunta:\s*', '', text)
    text = re.sub(r'!\[.*?\]\(.*?\)', '[imagen]', text)  # images -> placeholder
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)  # bold
    text = re.sub(r'\*(.+?)\*', r'\1', text)  # italic
    text = re.sub(r'`(.+?)`', r'\1', text)  # inline code
    text = re.sub(r'\$(.+?)\$', r'\1', text)  # math
    text = re.sub(r'\\textcolor\{[^}]+\}\{([^}]+)\}', r'\1', text)  # latex color
    text = text.strip()
    return text


def is_valid_card(q, a):
    """Verifica que la tarjeta tenga contenido util."""
    if not q or not a:
        return False
    if len(q) < 3 or len(a) < 2:
        return False
    if q.startswith('#') and len(q) < 10:
        return False
    # Skip empty or whitespace-only
    if q.strip() in ('', '-', '.', '>>>'):
        return False
    return True


def detect_card_type(question, answer):
    """Determina el tipo de quiz mas apropiado."""
    a_lower = answer.lower().strip()
    # True/False
    if a_lower in ('verdadero', 'falso', 'true', 'false', 'v', 'f'):
        return "true_false"
    # Short vocab (< 30 chars each side)
    if len(question) < 40 and len(answer) < 40:
        return "vocab"
    # Code
    if '```' in question or '```' in answer or 'import ' in answer:
        return "code"
    # Long explanation
    if len(answer) > 200:
        return "explain"
    return "concept"


def parse_line(line, file_category, file_tags):
    """Intenta parsear una linea como flashcard."""
    line = line.rstrip()
    if not line or line.strip() in ('-', '', '>>>'):
        return None

    for sep, sep_type in SEPARATORS:
        if sep in line:
            parts = line.split(sep, 1)
            if len(parts) == 2:
                q = clean_text(parts[0])
                a = clean_text(parts[1])
                if is_valid_card(q, a):
                    card_type = detect_card_type(q, a)
                    return {
                        "question": q,
                        "answer": a,
                        "type": card_type,
                        "format": sep_type,
                        "category": file_category,
                        "tags": file_tags,
                        "difficulty": 1,
                    }
    return None


def parse_file(filepath, category_info):
    """Parsea un archivo markdown de RemNote."""
    cards = []
    try:
        text = filepath.read_text(encoding='utf-8')
    except Exception:
        return cards

    for line in text.split('\n'):
        card = parse_line(line, category_info["category"], category_info["tags"])
        if card:
            cards.append(card)

    return cards


def deduplicate(cards):
    """Elimina duplicados por pregunta."""
    seen = set()
    unique = []
    for card in cards:
        key = card["question"].lower().strip()
        if key not in seen:
            seen.add(key)
            unique.append(card)
    return unique


def main():
    all_cards = []
    notes_dir = EXPORT_DIR / "notes"

    # Parsear archivos conocidos
    for filename, cat_info in FILE_CATEGORIES.items():
        filepath = notes_dir / filename
        if filepath.exists():
            cards = parse_file(filepath, cat_info)
            print(f"  {filename}: {len(cards)} cards")
            all_cards.extend(cards)

    # Parsear archivos adicionales en notes/
    if notes_dir.exists():
        for f in sorted(notes_dir.glob("*.md")):
            if f.name not in FILE_CATEGORIES:
                # Intentar categorizar por nombre
                name_lower = f.name.lower()
                if any(kw in name_lower for kw in ['fase', 'tesis', 'corte', 'maquina', 'broca']):
                    cat = {"category": "Tesis", "tags": ["tesis"]}
                elif any(kw in name_lower for kw in ['book', '4000', 'english', 'anki']):
                    cat = {"category": "English", "tags": ["ingles", "vocabulario"]}
                elif any(kw in name_lower for kw in ['french', 'français', 'salut']):
                    cat = {"category": "Frances", "tags": ["frances"]}
                else:
                    cat = {"category": "General", "tags": ["general"]}
                cards = parse_file(f, cat)
                if cards:
                    print(f"  {f.name}: {len(cards)} cards")
                    all_cards.extend(cards)

    # Deduplicar
    all_cards = deduplicate(all_cards)

    # Asignar IDs
    for i, card in enumerate(all_cards):
        card["id"] = i + 1

    # Estadisticas
    categories = {}
    for c in all_cards:
        cat = c["category"]
        categories[cat] = categories.get(cat, 0) + 1

    print(f"\nTotal: {len(all_cards)} cards unicas")
    print("Por categoria:")
    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")

    # Guardar
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(all_cards, ensure_ascii=False, indent=2),
        encoding='utf-8'
    )
    print(f"\nGuardado: {OUTPUT}")


if __name__ == "__main__":
    main()
