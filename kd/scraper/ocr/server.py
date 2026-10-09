from flask import Flask, request, jsonify
import easyocr
import os

app = Flask(__name__)

# Инициализируем EasyOCR
reader = easyocr.Reader(['sv', 'en'], gpu=False)

@app.route('/process-image', methods=['POST'])
def process_image():
    data = request.get_json()
    image_path = data.get('image_path')

    if not image_path or not os.path.exists(image_path):
        return jsonify({'error': 'Файл не найден'}), 400

    try:
        # detail=1 возвращает Bounding Boxes
        results = reader.readtext(image_path, detail=1)
        
        text_blocks = []
        for bbox, text, prob in results:
            x_min = min(point[0] for point in bbox)
            y_min = min(point[1] for point in bbox)
            x_max = max(point[0] for point in bbox)
            y_max = max(point[1] for point in bbox)

            text_blocks.append({
                'text': text.strip(),
                'confidence': float(prob),
                'bbox': {
                    'x_min': int(x_min),
                    'y_min': int(y_min),
                    'x_max': int(x_max),
                    'y_max': int(y_max)
                }
            })

        return jsonify({
            'success': True,
            'text_blocks': text_blocks
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000)