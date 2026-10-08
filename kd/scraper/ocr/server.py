import os
import torch
import easyocr
from flask import Flask, request, jsonify

app = Flask(__name__)

# --- АВТООПРЕДЕЛЕНИЕ ОБОРУДОВАНИЯ ---
def init_ocr():
    use_gpu = torch.cuda.is_available()
    
    if use_gpu:
        device_name = torch.cuda.get_device_name(0)
        print(f"[OCR] Найдена NVIDIA GPU: {device_name}. Запуск с поддержкой CUDA!")
    else:
        print("[OCR] CUDA GPU не найдена. Запуск на CPU (используется системная RAM).")

    # Инициализируем EasyOCR для финского и английского языков
    reader = easyocr.Reader(['en'], gpu=use_gpu)
    return reader

print("⏳ Инициализация модели EasyOCR...")
reader = init_ocr()

@app.route('/health', methods=['GET'])
def health_check():
    """Эндпоинт для проверки статуса сервиса"""
    return jsonify({
        "status": "online",
        "gpu_available": torch.cuda.is_available()
    })

@app.route('/process-image', methods=['POST'])
def process_image():
    """Эндпоинт для распознавания текста с картинки"""
    data = request.get_json()
    image_path = data.get('image_path')

    if not image_path or not os.path.exists(image_path):
        return jsonify({"error": "Файл изображения не найден"}), 400

    try:
        # Запуск распознавания
        results = reader.readtext(image_path, detail=0)
        return jsonify({
            "success": True,
            "text_blocks": results
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Запускаем Python-сервер на порту 5000
    print("✅ OCR сервис запущен на http://localhost:5000")
    app.run(host='0.0.0.0', port=5000)