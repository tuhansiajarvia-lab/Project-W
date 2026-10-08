import torch
import easyocr

def get_ocr_reader():
    # 1. Проверяем, есть ли поддержка NVIDIA CUDA (для твоего домашнего ПК с RTX 4060)
    if torch.cuda.is_available():
        print("Запуск OCR на RTX 4060...")
        return easyocr.Reader(['fi', 'en'], gpu=True)
    
    # 2. Если запускаем в колледже без CUDA
    else:
        print("Запуск OCR Radeon RX 6500...")
        return easyocr.Reader(['fi', 'en'], gpu=False)

reader = get_ocr_reader()