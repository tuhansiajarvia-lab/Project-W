from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import easyocr
import torch
import os

app = FastAPI()

# Проверяем доступность CUDA для вашей RTX 4060
use_gpu = torch.cuda.is_available()
print(f"CUDA доступна: {use_gpu}")
if use_gpu:
    print(f"Используется GPU: {torch.cuda.get_device_name(0)}")

# Инициализируем EasyOCR на видеокарте
reader = easyocr.Reader(['en'], gpu=use_gpu)

class ImageRequest(BaseModel):
    image_path: str

@app.post("/process-image")
async def process_image(req: ImageRequest):
    if not os.path.exists(req.image_path):
        raise HTTPException(status_code=404, detail=f"Файл не найден: {req.image_path}")
    
    try:
        # Запуск распознавания с возвратом координат (bbox) и текста
        raw_results = reader.readtext(req.image_path)
        
        text_blocks = []
        for item in raw_results:
            bbox, text, prob = item
            text_blocks.append({
                "bbox": bbox,
                "text": text,
                "confidence": float(prob)
            })
            
        return {
            "success": True,
            "text_blocks": text_blocks
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5000)