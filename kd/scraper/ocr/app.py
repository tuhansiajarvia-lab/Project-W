from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pytesseract
from PIL import Image
import os
import traceback

app = FastAPI()

# Указываем путь к установленному Tesseract
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

class ImageRequest(BaseModel):
    image_path: str

@app.post("/process-image")
async def process_image(req: ImageRequest):
    norm_path = os.path.abspath(req.image_path)
    
    if not os.path.exists(norm_path):
        raise HTTPException(status_status=404, detail=f"Файл не найден: {norm_path}")
    
    try:
        image = Image.open(norm_path)
        # Запускаем распознавание на финском и английском языках
        data = pytesseract.image_to_data(image, lang='fin', output_type=pytesseract.Output.DICT)
        
        text_blocks = []
        n_boxes = len(data['text'])
        
        for i in range(n_boxes):
            word = data['text'][i].strip()
            conf = int(data['conf'][i])
            
            if word and conf > 15:
                x = data['left'][i]
                y = data['top'][i]
                w = data['width'][i]
                h = data['height'][i]
                
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