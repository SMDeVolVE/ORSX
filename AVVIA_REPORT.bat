@echo off
echo --- Verifica Installazione Python ---
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRORE: Python non trovato. 
    echo Per favore, installa Python da python.org e spunta 'Add Python to PATH'.
    pause
    exit
)

echo --- Installazione Librerie (solo se mancano) ---
python -m pip install streamlit pandas openpyxl pillow --quiet

echo --- Avvio del Report in corso ---
python -m streamlit run app.py
pause