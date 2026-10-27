from fastapi import FastAPI, File, UploadFile
import easyocr
import io
from PIL import Image
import torch

app = FastAPI()

# Проверяем доступность CUDA для вашей RTX 4060
use_gpu = torch.cuda.is_available()
print(f"CUDA доступна: {use_gpu}")
if use_gpu:
    print(f"Используется GPU: {torch.cuda.get_device_name(0)}")

# Инициализируем EasyOCR на видеокарте
reader = easyocr.Reader(['en'], gpu=use_gpu)

@app.post("/ocr")
async def process_image(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        # Запуск быстрого распознавания на тензорных ядрах GPU
        results = reader.readtext(contents, detail=0)
        extracted_text = "\n".join(results)
        return {"success": True, "text": extracted_text}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)