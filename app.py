from datetime import datetime
from threading import Lock
from uuid import uuid4
from zoneinfo import ZoneInfo

from flask import Flask, jsonify, render_template, request

from google_sheets import (
    inicializar_hojas,
    invalidar_cache,
    obtener_hoja,
    obtener_registros,
)


app = Flask(__name__)

ZONA_HORARIA = ZoneInfo("America/Asuncion")
BLOQUEO_VENTAS = Lock()


# ==========================================
# FUNCIONES AUXILIARES
# ==========================================

def fecha_actual():
    return datetime.now(ZONA_HORARIA)


def convertir_numero(valor):
    if valor is None or valor == "":
        return 0

    if isinstance(valor, (int, float)):
        return int(valor)

    texto = str(valor)
    texto = texto.replace("Gs.", "")
    texto = texto.replace("Gs", "")
    texto = texto.replace(".", "")
    texto = texto.replace(",", "")
    texto = texto.strip()

    return int(float(texto or 0))


def generar_id(prefijo):
    codigo = uuid4().hex[:10].upper()
    return f"{prefijo}-{codigo}"


def buscar_producto(id_producto):
    hoja = obtener_hoja("PRODUCTOS")
    registros = obtener_registros("PRODUCTOS")

    for numero_fila, producto in enumerate(registros, start=2):
        if str(producto.get("ID_PRODUCTO")) == str(id_producto):
            return hoja, numero_fila, producto

    return hoja, None, None


def normalizar_codigo(codigo):
    return str(codigo or "").strip().upper().replace(" ", "")


def codigo_repetido(codigo, ignorar_id=None):
    codigo_buscado = normalizar_codigo(codigo)
    if not codigo_buscado:
        return False

    for producto in obtener_registros("PRODUCTOS"):
        mismo_codigo = normalizar_codigo(producto.get("CODIGO")) == codigo_buscado
        id_diferente = (
            ignorar_id is None
            or str(producto.get("ID_PRODUCTO")) != str(ignorar_id)
        )
        if mismo_codigo and id_diferente:
            return True
    return False


def producto_repetido(nombre, ignorar_id=None):
    registros = obtener_registros("PRODUCTOS")
    nombre_buscado = nombre.strip().lower()

    for producto in registros:
        mismo_nombre = (
            str(producto.get("NOMBRE", "")).strip().lower()
            == nombre_buscado
        )

        id_diferente = (
            ignorar_id is None
            or str(producto.get("ID_PRODUCTO")) != str(ignorar_id)
        )

        if mismo_nombre and id_diferente:
            return True

    return False


# ==========================================
# PÁGINA PRINCIPAL
# ==========================================

@app.route("/")
def inicio():
    return render_template("index.html")


# ==========================================
# COMPROBAR CONEXIÓN
# ==========================================

@app.route("/api/comprobar-conexion")
def comprobar_conexion():
    try:
        inicializar_hojas()

        return jsonify({
            "ok": True,
            "mensaje": "Conexión con Google Sheets correcta."
        })

    except Exception as error:
        return jsonify({
            "ok": False,
            "mensaje": str(error)
        }), 500


# ==========================================
# OBTENER PRODUCTOS
# ==========================================

@app.route("/api/productos", methods=["GET"])
def listar_productos():
    try:

        productos = obtener_registros("PRODUCTOS")

        resultado = []

        for producto in productos:
            stock_actual = convertir_numero(
                producto.get("STOCK_ACTUAL")
            )
            stock_minimo = convertir_numero(
                producto.get("STOCK_MINIMO")
            )

            resultado.append({
                "id_producto": producto.get("ID_PRODUCTO"),
                "codigo": normalizar_codigo(producto.get("CODIGO")),
                "nombre": producto.get("NOMBRE"),
                "categoria": producto.get("CATEGORIA"),
                "precio_compra": convertir_numero(
                    producto.get("PRECIO_COMPRA")
                ),
                "precio_venta": convertir_numero(
                    producto.get("PRECIO_VENTA")
                ),
                "stock_actual": stock_actual,
                "stock_minimo": stock_minimo,
                "estado": (
                    "STOCK BAJO"
                    if stock_actual <= stock_minimo
                    else "DISPONIBLE"
                ),
                "fecha_creacion": producto.get("FECHA_CREACION"),
                "ultima_actualizacion": producto.get(
                    "ULTIMA_ACTUALIZACION"
                ),
            })

        return jsonify({
            "ok": True,
            "productos": resultado
        })

    except Exception as error:
        return jsonify({
            "ok": False,
            "mensaje": str(error)
        }), 500


# ==========================================
# REGISTRAR PRODUCTO
# ==========================================

@app.route("/api/productos", methods=["POST"])
def registrar_producto():
    try:
        datos = request.get_json(silent=True) or {}

        codigo = normalizar_codigo(datos.get("codigo"))
        codigo = normalizar_codigo(datos.get("codigo"))
        nombre = str(datos.get("nombre", "")).strip()
        categoria = str(datos.get("categoria", "")).strip()
        precio_compra = convertir_numero(
            datos.get("precio_compra")
        )
        precio_venta = convertir_numero(
            datos.get("precio_venta")
        )
        stock_actual = convertir_numero(
            datos.get("stock_actual")
        )
        stock_minimo = convertir_numero(
            datos.get("stock_minimo")
        )

        if not codigo:
            return jsonify({
                "ok": False,
                "mensaje": "El código del producto es obligatorio."
            }), 400

        if codigo_repetido(codigo):
            return jsonify({
                "ok": False,
                "mensaje": "Ya existe un producto con ese código."
            }), 409

        if not nombre:
            return jsonify({
                "ok": False,
                "mensaje": "El nombre del producto es obligatorio."
            }), 400

        if not categoria:
            return jsonify({
                "ok": False,
                "mensaje": "La categoría es obligatoria."
            }), 400

        if precio_compra < 0 or precio_venta < 0:
            return jsonify({
                "ok": False,
                "mensaje": "Los precios no pueden ser negativos."
            }), 400

        if stock_actual < 0 or stock_minimo < 0:
            return jsonify({
                "ok": False,
                "mensaje": "El stock no puede ser negativo."
            }), 400

        if producto_repetido(nombre):
            return jsonify({
                "ok": False,
                "mensaje": "Ya existe un producto con ese nombre."
            }), 409

        ahora = fecha_actual()
        id_producto = generar_id("PROD")

        estado = (
            "STOCK BAJO"
            if stock_actual <= stock_minimo
            else "DISPONIBLE"
        )

        hoja = obtener_hoja("PRODUCTOS")

        hoja.append_row([
            id_producto,
            nombre,
            categoria,
            precio_compra,
            precio_venta,
            stock_actual,
            stock_minimo,
            estado,
            ahora.strftime("%Y-%m-%d %H:%M:%S"),
            ahora.strftime("%Y-%m-%d %H:%M:%S"),
            codigo,
        ])
        invalidar_cache("PRODUCTOS")

        return jsonify({
            "ok": True,
            "mensaje": "Producto registrado correctamente.",
            "id_producto": id_producto
        }), 201

    except Exception as error:
        return jsonify({
            "ok": False,
            "mensaje": str(error)
        }), 500


# ==========================================
# EDITAR PRODUCTO
# ==========================================

@app.route("/api/productos/<id_producto>", methods=["PUT"])
def editar_producto(id_producto):
    try:
        datos = request.get_json(silent=True) or {}

        hoja, numero_fila, producto = buscar_producto(id_producto)

        if not producto:
            return jsonify({
                "ok": False,
                "mensaje": "Producto no encontrado."
            }), 404

        nombre = str(datos.get("nombre", "")).strip()
        categoria = str(datos.get("categoria", "")).strip()
        precio_compra = convertir_numero(
            datos.get("precio_compra")
        )
        precio_venta = convertir_numero(
            datos.get("precio_venta")
        )
        stock_minimo = convertir_numero(
            datos.get("stock_minimo")
        )
        stock_actual = convertir_numero(
            producto.get("STOCK_ACTUAL")
        )

        if not codigo or not nombre or not categoria:
            return jsonify({
                "ok": False,
                "mensaje": "Código, nombre y categoría son obligatorios."
            }), 400

        if codigo_repetido(codigo, id_producto):
            return jsonify({
                "ok": False,
                "mensaje": "Ya existe otro producto con ese código."
            }), 409

        if precio_compra < 0 or precio_venta < 0:
            return jsonify({
                "ok": False,
                "mensaje": "Los precios no pueden ser negativos."
            }), 400

        if producto_repetido(nombre, id_producto):
            return jsonify({
                "ok": False,
                "mensaje": "Ya existe otro producto con ese nombre."
            }), 409

        estado = (
            "STOCK BAJO"
            if stock_actual <= stock_minimo
            else "DISPONIBLE"
        )

        hoja.update(
            range_name=f"B{numero_fila}:J{numero_fila}",
            values=[[
                nombre,
                categoria,
                precio_compra,
                precio_venta,
                stock_actual,
                stock_minimo,
                estado,
                producto.get("FECHA_CREACION"),
                fecha_actual().strftime("%Y-%m-%d %H:%M:%S"),
            ]]
        )
        hoja.update(
            range_name=f"K{numero_fila}",
            values=[[codigo]]
        )

        invalidar_cache("PRODUCTOS")

        return jsonify({
            "ok": True,
            "mensaje": "Producto actualizado correctamente."
        })

    except Exception as error:
        return jsonify({
            "ok": False,
            "mensaje": str(error)
        }), 500


# ==========================================
# ELIMINAR PRODUCTO
# ==========================================

@app.route("/api/productos/<id_producto>", methods=["DELETE"])
def eliminar_producto(id_producto):
    try:
        hoja, numero_fila, producto = buscar_producto(id_producto)

        if not producto:
            return jsonify({
                "ok": False,
                "mensaje": "Producto no encontrado."
            }), 404

        hoja.delete_rows(numero_fila)
        invalidar_cache("PRODUCTOS")

        return jsonify({
            "ok": True,
            "mensaje": "Producto eliminado correctamente."
        })

    except Exception as error:
        return jsonify({
            "ok": False,
            "mensaje": str(error)
        }), 500


# ==========================================
# REPONER STOCK
# ==========================================

@app.route("/api/reposiciones", methods=["POST"])
def reponer_stock():
    try:
        datos = request.get_json(silent=True) or {}

        id_producto = str(datos.get("id_producto", "")).strip()
        cantidad = convertir_numero(datos.get("cantidad"))
        nuevo_precio_compra = convertir_numero(
            datos.get("precio_compra")
        )

        if not id_producto or cantidad <= 0:
            return jsonify({
                "ok": False,
                "mensaje": "Producto y cantidad son obligatorios."
            }), 400

        hoja_productos, numero_fila, producto = buscar_producto(
            id_producto
        )

        if not producto:
            return jsonify({
                "ok": False,
                "mensaje": "Producto no encontrado."
            }), 404

        stock_anterior = convertir_numero(
            producto.get("STOCK_ACTUAL")
        )
        stock_nuevo = stock_anterior + cantidad
        stock_minimo = convertir_numero(
            producto.get("STOCK_MINIMO")
        )

        if nuevo_precio_compra <= 0:
            nuevo_precio_compra = convertir_numero(
                producto.get("PRECIO_COMPRA")
            )

        estado = (
            "STOCK BAJO"
            if stock_nuevo <= stock_minimo
            else "DISPONIBLE"
        )

        ahora = fecha_actual()

        hoja_productos.update(
            range_name=f"D{numero_fila}:J{numero_fila}",
            values=[[
                nuevo_precio_compra,
                convertir_numero(producto.get("PRECIO_VENTA")),
                stock_nuevo,
                stock_minimo,
                estado,
                producto.get("FECHA_CREACION"),
                ahora.strftime("%Y-%m-%d %H:%M:%S"),
            ]]
        )

        hoja_reposiciones = obtener_hoja("REPOSICIONES")

        hoja_reposiciones.append_row([
            generar_id("REP"),
            ahora.strftime("%Y-%m-%d"),
            ahora.strftime("%H:%M:%S"),
            id_producto,
            producto.get("NOMBRE"),
            cantidad,
            stock_anterior,
            stock_nuevo,
            nuevo_precio_compra,
        ])
        invalidar_cache("PRODUCTOS", "REPOSICIONES")

        return jsonify({
            "ok": True,
            "mensaje": "Stock repuesto correctamente.",
            "stock_nuevo": stock_nuevo
        })

    except Exception as error:
        return jsonify({
            "ok": False,
            "mensaje": str(error)
        }), 500


# ==========================================
# REGISTRAR VENTA
# ==========================================

@app.route("/api/ventas", methods=["POST"])
def registrar_venta():
    with BLOQUEO_VENTAS:
        try:
            datos = request.get_json(silent=True) or {}

            metodo_pago = str(
                datos.get("metodo_pago", "")
            ).strip().upper()

            productos_venta = datos.get("productos", [])

            metodos_permitidos = [
                "EFECTIVO",
                "TRANSFERENCIA",
                "TARJETA",
            ]

            if metodo_pago not in metodos_permitidos:
                return jsonify({
                    "ok": False,
                    "mensaje": "Método de pago inválido."
                }), 400

            if not productos_venta:
                return jsonify({
                    "ok": False,
                    "mensaje": "La venta no contiene productos."
                }), 400

            detalles = []
            cantidad_total = 0
            total_venta = 0
            costo_total = 0

            for item in productos_venta:
                id_producto = str(
                    item.get("id_producto", "")
                ).strip()

                cantidad = convertir_numero(
                    item.get("cantidad")
                )

                if cantidad <= 0:
                    return jsonify({
                        "ok": False,
                        "mensaje": "La cantidad debe ser mayor a cero."
                    }), 400

                hoja, numero_fila, producto = buscar_producto(
                    id_producto
                )

                if not producto:
                    return jsonify({
                        "ok": False,
                        "mensaje": "Uno de los productos no existe."
                    }), 404

                stock_actual = convertir_numero(
                    producto.get("STOCK_ACTUAL")
                )

                if cantidad > stock_actual:
                    return jsonify({
                        "ok": False,
                        "mensaje": (
                            f"Stock insuficiente para "
                            f"{producto.get('NOMBRE')}."
                        )
                    }), 400

                precio_compra = convertir_numero(
                    producto.get("PRECIO_COMPRA")
                )
                precio_venta = convertir_numero(
                    producto.get("PRECIO_VENTA")
                )

                subtotal = precio_venta * cantidad
                costo = precio_compra * cantidad
                ganancia = subtotal - costo
                stock_nuevo = stock_actual - cantidad

                detalles.append({
                    "hoja": hoja,
                    "numero_fila": numero_fila,
                    "producto": producto,
                    "id_producto": id_producto,
                    "cantidad": cantidad,
                    "precio_compra": precio_compra,
                    "precio_venta": precio_venta,
                    "subtotal": subtotal,
                    "costo": costo,
                    "ganancia": ganancia,
                    "stock_nuevo": stock_nuevo,
                })

                cantidad_total += cantidad
                total_venta += subtotal
                costo_total += costo

            id_venta = generar_id("VEN")
            ahora = fecha_actual()
            ganancia_total = total_venta - costo_total

            hoja_ventas = obtener_hoja("VENTAS")

            hoja_ventas.append_row([
                id_venta,
                ahora.strftime("%Y-%m-%d"),
                ahora.strftime("%H:%M:%S"),
                metodo_pago,
                total_venta,
                costo_total,
                ganancia_total,
                cantidad_total,
            ])

            hoja_detalles = obtener_hoja("DETALLE_VENTAS")

            for detalle in detalles:
                producto = detalle["producto"]
                stock_minimo = convertir_numero(
                    producto.get("STOCK_MINIMO")
                )

                estado = (
                    "STOCK BAJO"
                    if detalle["stock_nuevo"] <= stock_minimo
                    else "DISPONIBLE"
                )

                detalle["hoja"].update(
                    range_name=(
                        f"F{detalle['numero_fila']}:"
                        f"J{detalle['numero_fila']}"
                    ),
                    values=[[
                        detalle["stock_nuevo"],
                        stock_minimo,
                        estado,
                        producto.get("FECHA_CREACION"),
                        ahora.strftime("%Y-%m-%d %H:%M:%S"),
                    ]]
                )

                hoja_detalles.append_row([
                    generar_id("DET"),
                    id_venta,
                    detalle["id_producto"],
                    producto.get("NOMBRE"),
                    detalle["cantidad"],
                    detalle["precio_compra"],
                    detalle["precio_venta"],
                    detalle["subtotal"],
                    detalle["costo"],
                    detalle["ganancia"],
                ])

            invalidar_cache("PRODUCTOS", "VENTAS", "DETALLE_VENTAS")

            return jsonify({
                "ok": True,
                "mensaje": "Venta registrada correctamente.",
                "id_venta": id_venta,
                "total_venta": total_venta,
                "ganancia": ganancia_total
            }), 201

        except Exception as error:
            return jsonify({
                "ok": False,
                "mensaje": str(error)
            }), 500


# ==========================================
# HISTORIAL DE VENTAS
# ==========================================

@app.route("/api/ventas", methods=["GET"])
def historial_ventas():
    try:
        ventas = obtener_registros("VENTAS")

        ventas.reverse()

        return jsonify({
            "ok": True,
            "ventas": ventas
        })

    except Exception as error:
        return jsonify({
            "ok": False,
            "mensaje": str(error)
        }), 500


# ==========================================
# RESUMEN DIARIO Y MENSUAL
# ==========================================

@app.route("/api/resumen", methods=["GET"])
def obtener_resumen():
    try:
        ahora = fecha_actual()
        fecha_hoy = ahora.strftime("%Y-%m-%d")
        mes_actual = ahora.strftime("%Y-%m")

        ventas = obtener_registros("VENTAS")

        resumen = {
            "venta_dia": 0,
            "ganancia_dia": 0,
            "venta_mes": 0,
            "ganancia_mes": 0,
            "efectivo_dia": 0,
            "transferencia_dia": 0,
            "tarjeta_dia": 0,
            "cantidad_ventas_dia": 0,
            "cantidad_ventas_mes": 0,
        }

        for venta in ventas:
            fecha_venta = str(venta.get("FECHA", ""))
            total = convertir_numero(
                venta.get("TOTAL_VENTA")
            )
            ganancia = convertir_numero(
                venta.get("GANANCIA")
            )
            metodo = str(
                venta.get("METODO_PAGO", "")
            ).upper()

            if fecha_venta.startswith(mes_actual):
                resumen["venta_mes"] += total
                resumen["ganancia_mes"] += ganancia
                resumen["cantidad_ventas_mes"] += 1

            if fecha_venta == fecha_hoy:
                resumen["venta_dia"] += total
                resumen["ganancia_dia"] += ganancia
                resumen["cantidad_ventas_dia"] += 1

                if metodo == "EFECTIVO":
                    resumen["efectivo_dia"] += total

                elif metodo == "TRANSFERENCIA":
                    resumen["transferencia_dia"] += total

                elif metodo == "TARJETA":
                    resumen["tarjeta_dia"] += total

        productos = obtener_registros("PRODUCTOS")

        resumen["productos_registrados"] = len(productos)
        resumen["unidades_stock"] = sum(
            convertir_numero(producto.get("STOCK_ACTUAL"))
            for producto in productos
        )
        resumen["productos_stock_bajo"] = sum(
            1
            for producto in productos
            if convertir_numero(producto.get("STOCK_ACTUAL"))
            <= convertir_numero(producto.get("STOCK_MINIMO"))
        )

        return jsonify({
            "ok": True,
            "resumen": resumen
        })

    except Exception as error:
        return jsonify({
            "ok": False,
            "mensaje": str(error)
        }), 500


# ==========================================
# REPORTES MENSUALES
# ==========================================

@app.route("/api/reportes/mensual", methods=["GET"])
def reporte_mensual():
    try:
        mes = request.args.get("mes", "").strip()

        if not mes:
            mes = fecha_actual().strftime("%Y-%m")

        try:
            datetime.strptime(mes, "%Y-%m")
        except ValueError:
            return jsonify({
                "ok": False,
                "mensaje": "El periodo debe tener el formato AAAA-MM."
            }), 400

        ventas = obtener_registros("VENTAS")
        detalles = obtener_registros("DETALLE_VENTAS")

        ventas_mes = [
            venta for venta in ventas
            if str(venta.get("FECHA", "")).startswith(mes)
        ]
        ids_ventas = {
            str(venta.get("ID_VENTA", "")) for venta in ventas_mes
        }

        totales = {
            "total_vendido": 0,
            "costo_total": 0,
            "ganancia": 0,
            "cantidad_ventas": len(ventas_mes),
            "cantidad_productos": 0,
            "efectivo": 0,
            "transferencia": 0,
            "tarjeta": 0,
        }

        for venta in ventas_mes:
            total = convertir_numero(venta.get("TOTAL_VENTA"))
            costo = convertir_numero(venta.get("COSTO_TOTAL"))
            ganancia = convertir_numero(venta.get("GANANCIA"))
            cantidad = convertir_numero(
                venta.get("CANTIDAD_PRODUCTOS")
            )
            metodo = str(venta.get("METODO_PAGO", "")).upper()

            totales["total_vendido"] += total
            totales["costo_total"] += costo
            totales["ganancia"] += ganancia
            totales["cantidad_productos"] += cantidad

            if metodo == "EFECTIVO":
                totales["efectivo"] += total
            elif metodo == "TRANSFERENCIA":
                totales["transferencia"] += total
            elif metodo == "TARJETA":
                totales["tarjeta"] += total

        productos = {}

        for detalle in detalles:
            if str(detalle.get("ID_VENTA", "")) not in ids_ventas:
                continue

            nombre = str(detalle.get("PRODUCTO", "Sin nombre"))
            acumulado = productos.setdefault(nombre, {
                "producto": nombre,
                "cantidad": 0,
                "total_vendido": 0,
                "ganancia": 0,
            })
            acumulado["cantidad"] += convertir_numero(
                detalle.get("CANTIDAD")
            )
            acumulado["total_vendido"] += convertir_numero(
                detalle.get("SUBTOTAL")
            )
            acumulado["ganancia"] += convertir_numero(
                detalle.get("GANANCIA")
            )

        productos_mas_vendidos = sorted(
            productos.values(),
            key=lambda producto: (
                producto["cantidad"],
                producto["total_vendido"],
            ),
            reverse=True,
        )[:10]

        meses_disponibles = sorted({
            str(venta.get("FECHA", ""))[:7]
            for venta in ventas
            if len(str(venta.get("FECHA", ""))) >= 7
        }, reverse=True)

        ventas_mes.reverse()

        return jsonify({
            "ok": True,
            "periodo": mes,
            "totales": totales,
            "productos_mas_vendidos": productos_mas_vendidos,
            "ventas": ventas_mes,
            "meses_disponibles": meses_disponibles,
        })

    except Exception as error:
        return jsonify({
            "ok": False,
            "mensaje": str(error)
        }), 500


if __name__ == "__main__":
    app.run(debug=True)
