from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pytesseract
from PIL import Image, ImageEnhance, ImageOps
import os
import traceback

app = FastAPI()

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

class ImageRequest(BaseModel):
    image_path: str

@app.post("/process-image")
async def process_image(req: ImageRequest):
    norm_path = os.path.abspath(req.image_path)
    
    if not os.path.exists(norm_path):
        raise HTTPException(status_code=404, detail=f"Файл не найден: {norm_path}")
    
    try:
        image = Image.open(norm_path).convert('L') # Переводим в черно-белый формат для лучшего контраста
        
        # 1. Увеличиваем изображение в 2 раза (Upscaling), чтобы мелкий шрифт стал четче для Tesseract
        width, height = image.size
        image = image.resize((width * 2, height * 2), Image.Resampling.LANCZOS)
        
        # 2. Повышаем контрастность текста
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(2.0)
        
        # Запускаем распознавание с финским и английским языками
        data = pytesseract.image_to_data(image, lang='fin+eng', output_type=pytesseract.Output.DICT)
        
        text_blocks = []
        n_boxes = len(data['text'])
        
        for i in range(n_boxes):
            word = data['text'][i].strip()
            conf = int(data['conf'][i])
            
            if word and conf > 15:
                # Так как мы увеличили картинку в 2 раза, делим координаты обратно на 2, 
                # чтобы координаты прямоугольников (bbox) совпали с оригинальным размером страницы
                x = data['left'][i] // 2
                y = data['top'][i] // 2
                w = data['width'][i] // 2
                h = data['height'][i] // 2
                
                bbox = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
                
                text_blocks.append({
                    "bbox": bbox,
                    "text": word,
                    "confidence": float(conf / 100.0)
                })
            
        return {
            "success": True,
            "text_blocks": text_blocks
        }
    except Exception as e:
        traceback.print_exc()
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5000)