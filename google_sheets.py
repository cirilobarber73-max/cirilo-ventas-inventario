import json
import os
import time
from threading import RLock

import gspread
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials


load_dotenv()

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

HOJAS = {
    "PRODUCTOS": [
        "ID_PRODUCTO", "NOMBRE", "CATEGORIA", "PRECIO_COMPRA",
        "PRECIO_VENTA", "STOCK_ACTUAL", "STOCK_MINIMO", "ESTADO",
        "FECHA_CREACION", "ULTIMA_ACTUALIZACION",
    ],
    "VENTAS": [
        "ID_VENTA", "FECHA", "HORA", "METODO_PAGO", "TOTAL_VENTA",
        "COSTO_TOTAL", "GANANCIA", "CANTIDAD_PRODUCTOS",
    ],
    "DETALLE_VENTAS": [
        "ID_DETALLE", "ID_VENTA", "ID_PRODUCTO", "PRODUCTO",
        "CANTIDAD", "PRECIO_COMPRA", "PRECIO_VENTA", "SUBTOTAL",
        "COSTO", "GANANCIA",
    ],
    "REPOSICIONES": [
        "ID_REPOSICION", "FECHA", "HORA", "ID_PRODUCTO", "PRODUCTO",
        "CANTIDAD_AGREGADA", "STOCK_ANTERIOR", "STOCK_NUEVO",
        "PRECIO_COMPRA",
    ],
    "RESUMEN": [
        "FECHA", "TOTAL_VENDIDO", "COSTO_TOTAL", "GANANCIA",
        "EFECTIVO", "TRANSFERENCIA", "TARJETA",
    ],
}

TIEMPO_CACHE = int(os.getenv("CACHE_TTL_SECONDS", "30"))
_bloqueo = RLock()
_cliente = None
_libro = None
_hojas = {}
_cache_registros = {}


def obtener_credenciales():
    credenciales_json = os.getenv("GOOGLE_CREDENTIALS")
    archivo_credenciales = os.getenv("GOOGLE_CREDENTIALS_FILE")

    if credenciales_json:
        informacion = json.loads(credenciales_json)
        return Credentials.from_service_account_info(
            informacion,
            scopes=SCOPES,
        )

    if archivo_credenciales:
        return Credentials.from_service_account_file(
            archivo_credenciales,
            scopes=SCOPES,
        )

    raise RuntimeError("No se encontraron las credenciales de Google.")


def conectar_google_sheets():
    global _cliente, _libro

    with _bloqueo:
        if _libro is not None:
            return _libro

        spreadsheet_url = os.getenv("SPREADSHEET_URL")
        if not spreadsheet_url:
            raise RuntimeError(
                "No se configuró SPREADSHEET_URL en el archivo .env."
            )

        _cliente = gspread.authorize(obtener_credenciales())
        _libro = _cliente.open_by_url(spreadsheet_url)
        return _libro


def obtener_hoja(nombre_hoja):
    with _bloqueo:
        if nombre_hoja not in _hojas:
            _hojas[nombre_hoja] = conectar_google_sheets().worksheet(
                nombre_hoja
            )
        return _hojas[nombre_hoja]


def obtener_registros(nombre_hoja, forzar=False):
    """Lee una hoja una vez y reutiliza el resultado durante 30 segundos."""
    with _bloqueo:
        ahora = time.monotonic()
        guardado = _cache_registros.get(nombre_hoja)

        if guardado and not forzar:
            instante, registros = guardado
            if ahora - instante < TIEMPO_CACHE:
                return [dict(fila) for fila in registros]

        registros = obtener_hoja(nombre_hoja).get_all_records()
        _cache_registros[nombre_hoja] = (ahora, registros)
        return [dict(fila) for fila in registros]


def invalidar_cache(*nombres_hojas):
    with _bloqueo:
        if not nombres_hojas:
            _cache_registros.clear()
            return

        for nombre in nombres_hojas:
            _cache_registros.pop(nombre, None)


def inicializar_hojas():
    libro = conectar_google_sheets()
    existentes = {hoja.title: hoja for hoja in libro.worksheets()}

    for nombre, encabezados in HOJAS.items():
        hoja = existentes.get(nombre)

        if hoja is None:
            hoja = libro.add_worksheet(
                title=nombre,
                rows=1000,
                cols=max(len(encabezados), 10),
            )
            hoja.append_row(encabezados)
        elif not hoja.row_values(1):
            hoja.append_row(encabezados)

        _hojas[nombre] = hoja

    invalidar_cache()
    return True
