from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import easyocr
import torch
import os
import traceback

app = FastAPI()

# Проверяем доступность CUDA
use_gpu = torch.cuda.is_available()
print(f"CUDA доступна: {use_gpu}")

# Инициализируем EasyOCR
reader = easyocr.Reader(['en', 'la'], gpu=use_gpu)

class ImageRequest(BaseModel):
    image_path: str

@app.post("/process-image")
async def process_image(req: ImageRequest):
    norm_path = os.path.abspath(req.image_path)
    
    if not os.path.exists(norm_path):
        print(f"[ERROR] Файл не найден по пути: {norm_path}")
        raise HTTPException(status_code=404, detail=f"Файл не найден: {norm_path}")
    
    try:
        print(f"[OCR] Обработка файла: {norm_path}")
        raw_results = reader.readtext(norm_path)
        
        text_blocks = []
        for item in raw_results:
            bbox, text, prob = item
            
            # Превращаем numpy-числа из bbox в обычные python int, 
            # чтобы FastAPI мог спокойно упаковать их в JSON
            clean_bbox = [
                [int(point[0]), int(point[1])] for point in bbox
            ]
            
            text_blocks.append({
                "bbox": clean_bbox,
                "text": text,
                "confidence": float(prob)
            })
            
        return {
            "success": True,
            "text_blocks": text_blocks
        }
    except Exception as e:
        print(f"[CRITICAL ERROR] Ошибка при обработке EasyOCR:")
        traceback.print_exc()
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5000)