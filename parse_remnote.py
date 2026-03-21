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

# Keywords para re-categorizacion
ML_KEYWORDS = [
    'aprendizaje', 'machine learning', 'red neuronal', 'neurona', 'modelo',
    'entrenamiento', 'clasificaci', 'regresi', 'supervisado', 'overfitting',
    'sobreajuste', 'epoch', 'batch', 'gradient', 'backpropag', 'loss',
    'accuracy', 'precision', 'recall', 'f1', 'cross-valid', 'hiperpar',
    'tensorflow', 'keras', 'sklearn', 'scikit', 'svm', 'random forest',
    'cnn', 'lstm', 'rnn', 'perceptr', 'dense', 'dropout', 'relu', 'sigmoid',
    'softmax', 'features', 'dataset', 'pipeline', 'cluster', 'kmeans', 'pca',
    'mfcc', 'mel', 'librosa', 'audio', 'spectro', 'rms', 'broca', 'desgaste',
    'wavelet', 'ridge', 'lasso', 'regulariz', 'underfit', 'overfit',
    'training set', 'test set', 'validation', 'bias', 'variance', 'ensemble',
    'bagging', 'boosting',
]
PYTHON_KEYWORDS = [
    'python', 'numpy', 'pandas', 'matplotlib', 'import ', 'def ', 'class ',
    'dictionary', 'lambda', 'os.', 'json', 'exception', 'try:', 'pip',
    'df[', 'dataframe', '.groupby', 'pd.', 'np.', '.iloc', '.loc',
]
EXCEL_KEYWORDS = [
    'excel', 'worksheet', 'cell', 'range(', 'formula', 'vlookup', 'isnontext',
    'countif', 'sumif', 'pivot', 'chart', 'macro', '(ws)', '#functions',
]
SOLIDWORKS_KEYWORDS = [
    'solidworks', 'cswpa', 'sketch', 'extrude', 'loft', 'sweep', 'assembly',
    'mate', 'swapp', 'bom',
]
THERMO_KEYWORDS = [
    'calor', 'convección', 'conducción', 'temperatura', 'termodinámica',
    'entropy', 'entalp', 'compressor', 'exchanger', 'intercambiador',
]
FRENCH_KEYWORDS = [
    'complétez', 'conjuguez', 'choisissez', 'imparfait', 'passé composé',
    'futur simple', 'subjonctif',
]
PORTUGUES_KEYWORDS = [
    'pretérito', 'subjuntivo', 'imperfeito', 'conjugação', 'português',
    'presente do', 'futuro do',
]
SAP_KEYWORDS = ['sap', 'legalizacion', 'huacal']
ARDUINO_KEYWORDS = ['arduino', 'digitalwrite', 'analogread', 'serial.']


def clean_text(text):
    """Limpia texto de markdown artifacts, preservando imagenes como HTML."""
    text = text.strip()
    text = re.sub(r'^\s*-\s*', '', text)  # remove leading bullet
    text = re.sub(r'^\s*Pregunta\s*\d*:\s*', '', text)  # remove "Pregunta N:"
    text = re.sub(r'^\s*Pregunta:\s*', '', text)
    # Preservar imagenes como tags <img> (URLs de RemNote S3)
    text = re.sub(
        r'!\[([^\]]*)\]\((https?://[^)]+)\)',
        r'<img src="\2" alt="\1">',
        text
    )
    # Preservar code blocks
    text = re.sub(r'```(\w*)\n?(.*?)```', r'<code>\2</code>', text, flags=re.DOTALL)
    # Limpiar formatting
    text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)  # bold -> <b>
    text = re.sub(r'\*(.+?)\*', r'<i>\1</i>', text)  # italic -> <i>
    text = re.sub(r'`(.+?)`', r'<code>\1</code>', text)  # inline code
    # Limpiar LaTeX
    text = re.sub(r'\\textcolor\{[^}]+\}\{([^}]+)\}', r'\1', text)
    # Mantener formulas simples entre $
    text = re.sub(r'\$([^$]+)\$', r'<i>\1</i>', text)
    text = text.strip()
    return text


def is_valid_card(q, a):
    """Verifica que la tarjeta tenga contenido util."""
    if not q or not a:
        return False

    # Strip HTML tags for length checks
    q_plain = re.sub(r'<[^>]+>', '', q).strip()
    a_plain = re.sub(r'<[^>]+>', '', a).strip()

    if len(q_plain) < 3 or len(a_plain) < 2:
        return False
    if q_plain.startswith('#') and len(q_plain) < 10:
        return False
    if q_plain in ('', '-', '.', '>>>', 'V1'):
        return False

    # Filter nonsense patterns
    # Solo numeros o puntuacion
    if re.match(r'^[\d\s.,:;!?-]+$', q_plain):
        return False
    # Solo una palabra sola como pregunta sin sentido (excepto vocab)
    if len(q_plain.split()) == 1 and len(a_plain.split()) == 1:
        # Single word -> single word is fine for vocab
        pass
    # Headers sueltos sin contenido real
    if q_plain.startswith('#') and '?' not in q_plain and len(q_plain) < 30:
        return False
    # RemNote artifacts
    if any(art in q_plain.lower() for art in ['#[[anki card', '[image]', '[sound]',
                                                '[sound_meaning]', '[sound_example]',
                                                '[meaning]', '[example]', '[ipa]']):
        return False
    if any(art in a_plain.lower() for art in ['#[[anki card', '[image]', '[sound]',
                                               '[sound_meaning]', '[sound_example]']):
        return False
    # Empty after stripping refs
    if a_plain.startswith('[') and a_plain.endswith(']') and 'http' not in a_plain:
        return False
    # Skip cards where answer is just a link path
    if a_plain.startswith('../notes/'):
        return False

    return True


def detect_card_type(question, answer):
    """Determina el tipo de quiz mas apropiado."""
    a_plain = re.sub(r'<[^>]+>', '', answer).strip().lower()

    # True/False
    if a_plain in ('verdadero', 'falso', 'true', 'false', 'v', 'f'):
        return "true_false"
    # Has image
    if '<img' in question or '<img' in answer:
        return "image"
    # Code
    if '<code>' in question or '<code>' in answer:
        return "code"
    # Short vocab (< 40 chars each side, plain text)
    q_plain = re.sub(r'<[^>]+>', '', question).strip()
    if len(q_plain) < 40 and len(a_plain) < 40:
        return "vocab"
    # Long explanation
    if len(a_plain) > 200:
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
    """Elimina duplicados por pregunta (normalizada)."""
    seen = set()
    unique = []
    for card in cards:
        # Normalize: strip HTML, lowercase, strip whitespace
        key = re.sub(r'<[^>]+>', '', card["question"]).lower().strip()
        if key not in seen:
            seen.add(key)
            unique.append(card)
    return unique


def recategorize(cards):
    """Re-categoriza cards 'General' basandose en contenido."""
    for card in cards:
        if card['category'] != 'General':
            continue
        text = (card['question'] + ' ' + card['answer']).lower()
        text = re.sub(r'<[^>]+>', '', text)  # strip HTML for matching

        if any(kw in text for kw in ML_KEYWORDS):
            card['category'] = 'ML y Audio'
            card['tags'] = ['ml', 'tesis']
        elif any(kw in text for kw in PYTHON_KEYWORDS):
            card['category'] = 'Python'
            card['tags'] = ['python', 'programacion']
        elif any(kw in text for kw in EXCEL_KEYWORDS):
            card['category'] = 'Excel'
            card['tags'] = ['excel', 'herramientas']
        elif any(kw in text for kw in SOLIDWORKS_KEYWORDS):
            card['category'] = 'SolidWorks'
            card['tags'] = ['solidworks']
        elif any(kw in text for kw in THERMO_KEYWORDS):
            card['category'] = 'Termodinamica'
            card['tags'] = ['termodinamica', 'ingenieria']
        elif any(kw in text for kw in SAP_KEYWORDS):
            card['category'] = 'SAP'
            card['tags'] = ['sap']
        elif any(kw in text for kw in ARDUINO_KEYWORDS):
            card['category'] = 'Arduino/IoT'
            card['tags'] = ['arduino', 'iot']
        elif any(kw in text for kw in PORTUGUES_KEYWORDS):
            card['category'] = 'Portugues'
            card['tags'] = ['portugues', 'idioma']
        elif any(kw in text for kw in FRENCH_KEYWORDS):
            card['category'] = 'Frances'
            card['tags'] = ['frances', 'idioma']
    return cards


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
    before_dedup = len(all_cards)
    all_cards = deduplicate(all_cards)
    print(f"\nDeduplicados: {before_dedup} -> {len(all_cards)}")

    # Re-categorizar General
    all_cards = recategorize(all_cards)

    # Asignar IDs
    for i, card in enumerate(all_cards):
        card["id"] = i + 1

    # Estadisticas
    categories = {}
    type_counts = {}
    for c in all_cards:
        categories[c["category"]] = categories.get(c["category"], 0) + 1
        type_counts[c["type"]] = type_counts.get(c["type"], 0) + 1

    print(f"\nTotal: {len(all_cards)} cards unicas")
    print("\nPor categoria:")
    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")
    print("\nPor tipo:")
    for t, count in sorted(type_counts.items(), key=lambda x: -x[1]):
        print(f"  {t}: {count}")

    # Count cards with images
    with_images = sum(1 for c in all_cards if '<img' in c['question'] or '<img' in c['answer'])
    print(f"\nCon imagenes: {with_images}")

    # Guardar
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(all_cards, ensure_ascii=False, indent=2),
        encoding='utf-8'
    )
    print(f"\nGuardado: {OUTPUT}")


if __name__ == "__main__":
    main()
