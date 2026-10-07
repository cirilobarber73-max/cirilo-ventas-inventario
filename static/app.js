let productos = [];
let carrito = [];
let productoEditando = null;


// ==========================================
// INICIAR SISTEMA
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {
    configurarFecha();
    configurarMenu();
    configurarEventos();
    configurarMesReporte();

    await Promise.all([
        cargarProductos(),
        cargarResumen(),
        cargarHistorial()
    ]);
});


function configurarFecha() {
    const fecha = new Date();

    document.getElementById("fechaActual").textContent =
        fecha.toLocaleDateString("es-PY", {
            day: "2-digit",
            month: "long",
            year: "numeric"
        });
}


function configurarMenu() {
    document.querySelectorAll(".menu-item").forEach((boton) => {
        boton.addEventListener("click", () => {
            mostrarSeccion(boton.dataset.seccion);
        });
    });

    document
        .getElementById("btnMenuMovil")
        .addEventListener("click", () => {
            document
                .getElementById("sidebar")
                .classList.toggle("show");
        });
}


function configurarEventos() {
    document
        .getElementById("buscarProducto")
        .addEventListener("input", renderizarProductos);

    document
        .getElementById("filtroCategoria")
        .addEventListener("change", renderizarProductos);

    document
        .getElementById("filtroStock")
        .addEventListener("change", renderizarProductos);

    document
        .getElementById("buscarProductoVenta")
        .addEventListener("input", renderizarCatalogo);

    document
        .getElementById("buscarProductoVenta")
        .addEventListener("keydown", (evento) => {
            if (evento.key !== "Enter") return;

            evento.preventDefault();
            const campo = evento.currentTarget;
            const buscado = campo.value.trim().toUpperCase();
            if (!buscado) return;

            const producto = productos.find(
                (item) => String(item.codigo || "").toUpperCase() === buscado
            );

            if (!producto) {
                mostrarToast("No existe un producto con ese código.", "error");
                return;
            }

            agregarAlCarrito(producto.id_producto);
            campo.value = "";
            renderizarCatalogo();
            campo.focus();
        });

    document
        .getElementById("formProducto")
        .addEventListener("submit", guardarProducto);

    document
        .getElementById("formReposicion")
        .addEventListener("submit", guardarReposicion);

    document
        .getElementById("btnVaciarCarrito")
        .addEventListener("click", vaciarCarrito);

    document
        .getElementById("btnConfirmarVenta")
        .addEventListener("click", confirmarVenta);

    document
        .getElementById("btnActualizarHistorial")
        .addEventListener("click", cargarHistorial);

    document
        .getElementById("btnCargarReporte")
        .addEventListener("click", cargarReporteMensual);

    document
        .getElementById("reporteMes")
        .addEventListener("change", cargarReporteMensual);

    document
        .getElementById("modalProducto")
        .addEventListener("click", (evento) => {
            if (evento.target.id === "modalProducto") {
                cerrarModalProducto();
            }
        });

    document
        .getElementById("modalReposicion")
        .addEventListener("click", (evento) => {
            if (evento.target.id === "modalReposicion") {
                cerrarModalReposicion();
            }
        });
}


// ==========================================
// FUNCIONES GENERALES
// ==========================================

function mostrarSeccion(nombre) {
    document.querySelectorAll(".seccion").forEach((seccion) => {
        seccion.classList.remove("active");
    });

    document.querySelectorAll(".menu-item").forEach((boton) => {
        boton.classList.remove("active");
    });

    const seccion = document.getElementById(`seccion-${nombre}`);

    if (seccion) {
        seccion.classList.add("active");
    }

    const botonMenu = document.querySelector(
        `.menu-item[data-seccion="${nombre}"]`
    );

    if (botonMenu) {
        botonMenu.classList.add("active");
    }

    const titulos = {
        panel: "Panel principal",
        productos: "Productos",
        ventas: "Nueva venta",
        historial: "Historial de ventas",
        reportes: "Reportes mensuales"
    };

    document.getElementById("tituloSeccion").textContent =
        titulos[nombre] || "Cirilo Barber";

    document.getElementById("sidebar").classList.remove("show");

    if (nombre === "historial") {
        cargarHistorial();
    }

    if (nombre === "reportes") {
        cargarReporteMensual();
    }
}


function configurarMesReporte() {
    const fecha = new Date();
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    document.getElementById("reporteMes").value = `${anio}-${mes}`;
}


function formatearGs(valor) {
    const numero = Number(valor) || 0;

    return `${new Intl.NumberFormat("es-PY").format(numero)} Gs.`;
}


function escaparHTML(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


async function solicitar(url, opciones = {}) {
    const respuesta = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            ...(opciones.headers || {})
        },
        ...opciones
    });

    const tipoContenido = respuesta.headers.get("content-type") || "";
    const datos = tipoContenido.includes("application/json")
        ? await respuesta.json()
        : {
            ok: false,
            mensaje: `El servidor respondió con error ${respuesta.status}.`
        };

    if (!respuesta.ok || datos.ok === false) {
        throw new Error(
            datos.mensaje || "No se pudo completar la operación."
        );
    }

    return datos;
}


function mostrarToast(mensaje, tipo = "success") {
    const contenedor = document.getElementById("toastContainer");
    const toast = document.createElement("div");

    toast.className = `toast ${tipo}`;
    toast.textContent = mensaje;

    contenedor.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3500);
}


// ==========================================
// CARGAR PRODUCTOS
// ==========================================

async function cargarProductos() {
    try {
        const datos = await solicitar("/api/productos");

        productos = datos.productos || [];

        cargarCategorias();
        renderizarProductos();
        renderizarCatalogo();
        renderizarStockBajo();
        sincronizarCarrito();

    } catch (error) {
        mostrarToast(error.message, "error");

        document.getElementById("tablaProductos").innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="empty-state">
                        No se pudieron cargar los productos.
                    </div>
                </td>
            </tr>
        `;
    }
}


function cargarCategorias() {
    const selector = document.getElementById("filtroCategoria");
    const valorActual = selector.value;

    const categorias = [
        ...new Set(
            productos
                .map((producto) => producto.categoria)
                .filter(Boolean)
        )
    ].sort();

    selector.innerHTML = `
        <option value="">Todas las categorías</option>
        ${categorias.map((categoria) => `
            <option value="${escaparHTML(categoria)}">
                ${escaparHTML(categoria)}
            </option>
        `).join("")}
    `;

    selector.value = valorActual;
}


function obtenerEstadoProducto(producto) {
    const stock = Number(producto.stock_actual) || 0;
    const minimo = Number(producto.stock_minimo) || 0;

    if (stock <= 0) {
        return "agotado";
    }

    if (stock <= minimo) {
        return "bajo";
    }

    return "disponible";
}


function obtenerProductosFiltrados() {
    const busqueda = document
        .getElementById("buscarProducto")
        .value
        .trim()
        .toLowerCase();

    const categoria = document
        .getElementById("filtroCategoria")
        .value;

    const filtroStock = document
        .getElementById("filtroStock")
        .value;

    return productos.filter((producto) => {
        const coincideNombre = String(producto.nombre)
            .toLowerCase()
            .includes(busqueda);

        const coincideCodigo = String(producto.codigo || "")
            .toLowerCase()
            .includes(busqueda);

        const coincideCategoria =
            !categoria || producto.categoria === categoria;

        const coincideStock =
            !filtroStock
            || obtenerEstadoProducto(producto) === filtroStock;

        return (
            (coincideNombre || coincideCodigo)
            && coincideCategoria
            && coincideStock
        );
    });
}


function renderizarProductos() {
    const cuerpo = document.getElementById("tablaProductos");
    const lista = obtenerProductosFiltrados();

    if (!lista.length) {
        cuerpo.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="empty-state">
                        No se encontraron productos.
                    </div>
                </td>
            </tr>
        `;

        return;
    }

    cuerpo.innerHTML = lista.map((producto) => {
        const ganancia =
            Number(producto.precio_venta)
            - Number(producto.precio_compra);

        const estado = obtenerEstadoProducto(producto);

        const textoEstado = {
            disponible: "Disponible",
            bajo: "Stock bajo",
            agotado: "Agotado"
        };

        const claseEstado =
            estado === "disponible"
                ? "success"
                : "warning";

        return `
            <tr>
                <td>
                    <div class="product-name-cell">
                        <strong>
                            ${escaparHTML(producto.nombre)}
                        </strong>

                        <small>
                            Código: ${escaparHTML(producto.codigo || "SIN CÓDIGO")}
                        </small>
                    </div>
                </td>

                <td>
                    ${escaparHTML(producto.categoria)}
                </td>

                <td>
                    ${formatearGs(producto.precio_compra)}
                </td>

                <td>
                    <strong>
                        ${formatearGs(producto.precio_venta)}
                    </strong>
                </td>

                <td class="price-profit">
                    ${formatearGs(ganancia)}
                </td>

                <td>
                    <strong>${producto.stock_actual}</strong>
                    / mínimo ${producto.stock_minimo}
                </td>

                <td>
                    <span class="badge ${claseEstado}">
                        ${textoEstado[estado]}
                    </span>
                </td>

                <td>
                    <div class="actions">
                        <button
                            class="action-button"
                            onclick="abrirModalReposicion(
                                '${producto.id_producto}'
                            )"
                        >
                            Reponer
                        </button>

                        <button
                            class="action-button"
                            onclick="editarProducto(
                                '${producto.id_producto}'
                            )"
                        >
                            Editar
                        </button>

                        <button
                            class="action-button delete"
                            onclick="eliminarProducto(
                                '${producto.id_producto}'
                            )"
                        >
                            Eliminar
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}


// ==========================================
// MODAL PRODUCTO
// ==========================================

function abrirModalProducto() {
    productoEditando = null;

    document.getElementById("formProducto").reset();
    document.getElementById("productoId").value = "";
    document.getElementById("tituloModalProducto").textContent =
        "Registrar producto";

    document.getElementById("grupoStockInicial").style.display =
        "block";

    document.getElementById("productoStock").required = true;

    document
        .getElementById("modalProducto")
        .classList.add("show");
}


function cerrarModalProducto() {
    document
        .getElementById("modalProducto")
        .classList.remove("show");

    document.getElementById("formProducto").reset();
    productoEditando = null;
}


function editarProducto(idProducto) {
    const producto = productos.find(
        (item) => item.id_producto === idProducto
    );

    if (!producto) {
        mostrarToast("Producto no encontrado.", "error");
        return;
    }

    productoEditando = producto;

    document.getElementById("productoId").value =
        producto.id_producto;

    document.getElementById("productoCodigo").value =
        producto.codigo || "";

    document.getElementById("productoNombre").value =
        producto.nombre;

    document.getElementById("productoCategoria").value =
        producto.categoria;

    document.getElementById("productoCompra").value =
        producto.precio_compra;

    document.getElementById("productoVenta").value =
        producto.precio_venta;

    document.getElementById("productoStockMinimo").value =
        producto.stock_minimo;

    document.getElementById("tituloModalProducto").textContent =
        "Editar producto";

    document.getElementById("grupoStockInicial").style.display =
        "none";

    document.getElementById("productoStock").required = false;

    document
        .getElementById("modalProducto")
        .classList.add("show");
}


async function guardarProducto(evento) {
    evento.preventDefault();

    const idProducto =
        document.getElementById("productoId").value;

    const datos = {
        codigo:
            document
                .getElementById("productoCodigo")
                .value
                .trim()
                .toUpperCase(),

        nombre:
            document.getElementById("productoNombre").value.trim(),

        categoria:
            document.getElementById("productoCategoria").value.trim(),

        precio_compra:
            Number(
                document.getElementById("productoCompra").value
            ),

        precio_venta:
            Number(
                document.getElementById("productoVenta").value
            ),

        stock_minimo:
            Number(
                document
                    .getElementById("productoStockMinimo")
                    .value
            )
    };

    if (!datos.codigo) {
        mostrarToast(
            "Ingresá el código del producto.",
            "error"
        );
        return;
    }

    if (!idProducto) {
        datos.stock_actual = Number(
            document.getElementById("productoStock").value
        );
    }

    try {
        if (idProducto) {
            await solicitar(`/api/productos/${idProducto}`, {
                method: "PUT",
                body: JSON.stringify(datos)
            });

            mostrarToast(
                "Producto actualizado correctamente."
            );

        } else {
            await solicitar("/api/productos", {
                method: "POST",
                body: JSON.stringify(datos)
            });

            mostrarToast(
                "Producto registrado correctamente."
            );
        }

        cerrarModalProducto();

        await Promise.all([
            cargarProductos(),
            cargarResumen()
        ]);

    } catch (error) {
        mostrarToast(error.message, "error");
    }
}

async function eliminarProducto(idProducto) {
    const producto = productos.find(
        (item) => item.id_producto === idProducto
    );

    if (!producto) {
        return;
    }

    const confirmar = window.confirm(
        `¿Querés eliminar el producto "${producto.nombre}"?`
    );

    if (!confirmar) {
        return;
    }

    try {
        await solicitar(`/api/productos/${idProducto}`, {
            method: "DELETE"
        });

        mostrarToast("Producto eliminado correctamente.");

        await Promise.all([
            cargarProductos(),
            cargarResumen()
        ]);

    } catch (error) {
        mostrarToast(error.message, "error");
    }
}


// ==========================================
// REPOSICIÓN
// ==========================================

function abrirModalReposicion(idProducto) {
    const producto = productos.find(
        (item) => item.id_producto === idProducto
    );

    if (!producto) {
        mostrarToast("Producto no encontrado.", "error");
        return;
    }

    document.getElementById("formReposicion").reset();

    document.getElementById("reposicionProductoId").value =
        producto.id_producto;

    document.getElementById("reposicionProductoNombre").textContent =
        producto.nombre;

    document.getElementById("reposicionStockActual").textContent =
        `Stock actual: ${producto.stock_actual}`;

    document.getElementById("reposicionPrecioCompra").value =
        producto.precio_compra;

    document
        .getElementById("modalReposicion")
        .classList.add("show");
}


function cerrarModalReposicion() {
    document
        .getElementById("modalReposicion")
        .classList.remove("show");

    document.getElementById("formReposicion").reset();
}


async function guardarReposicion(evento) {
    evento.preventDefault();

    const datos = {
        id_producto:
            document.getElementById("reposicionProductoId").value,
        cantidad:
            Number(
                document.getElementById("reposicionCantidad").value
            ),
        precio_compra:
            Number(
                document
                    .getElementById("reposicionPrecioCompra")
                    .value
            )
    };

    try {
        await solicitar("/api/reposiciones", {
            method: "POST",
            body: JSON.stringify(datos)
        });

        mostrarToast("Stock repuesto correctamente.");
        cerrarModalReposicion();

        await Promise.all([
            cargarProductos(),
            cargarResumen()
        ]);

    } catch (error) {
        mostrarToast(error.message, "error");
    }
}


// ==========================================
// CATÁLOGO DE VENTA
// ==========================================

function renderizarCatalogo() {
    const contenedor = document.getElementById("catalogoVenta");

    const busqueda = document
        .getElementById("buscarProductoVenta")
        .value
        .trim()
        .toLowerCase();

    const lista = productos.filter((producto) => {
        const nombre = String(producto.nombre || "").toLowerCase();
        const codigo = String(producto.codigo || "").toLowerCase();
        return nombre.includes(busqueda) || codigo.includes(busqueda);
    });

    if (!lista.length) {
        contenedor.innerHTML = `
            <div class="empty-state">
                No se encontraron productos.
            </div>
        `;

        return;
    }

    contenedor.innerHTML = lista.map((producto) => {
        const agotado = Number(producto.stock_actual) <= 0;

        return `
            <article
                class="catalog-product ${agotado ? "disabled" : ""}"
            >
                <span class="catalog-product-category">
                    ${escaparHTML(producto.categoria)}
                </span>

                <h4>
                    ${escaparHTML(producto.nombre)}
                </h4>

                <span class="catalog-product-code">
                    ${escaparHTML(producto.codigo || "SIN CÓDIGO")}
                </span>

                <span class="catalog-product-stock">
                    Stock disponible: ${producto.stock_actual}
                </span>

                <div class="catalog-product-footer">
                    <span class="catalog-product-price">
                        ${formatearGs(producto.precio_venta)}
                    </span>

                    <button
                        class="add-cart-button"
                        type="button"
                        onclick="agregarAlCarrito(
                            '${producto.id_producto}'
                        )"
                        ${agotado ? "disabled" : ""}
                    >
                        +
                    </button>
                </div>
            </article>
        `;
    }).join("");
}


// ==========================================
// CARRITO
// ==========================================

function agregarAlCarrito(idProducto) {
    const producto = productos.find(
        (item) => item.id_producto === idProducto
    );

    if (!producto || Number(producto.stock_actual) <= 0) {
        mostrarToast("El producto no tiene stock.", "error");
        return;
    }

    const existente = carrito.find(
        (item) => item.id_producto === idProducto
    );

    if (existente) {
        if (existente.cantidad >= Number(producto.stock_actual)) {
            mostrarToast(
                "No hay más unidades disponibles.",
                "error"
            );
            return;
        }

        existente.cantidad += 1;

    } else {
        carrito.push({
            id_producto: producto.id_producto,
            codigo: producto.codigo || "",
            nombre: producto.nombre,
            precio_compra: Number(producto.precio_compra),
            precio_venta: Number(producto.precio_venta),
            stock_actual: Number(producto.stock_actual),
            cantidad: 1
        });
    }

    renderizarCarrito();
}


function cambiarCantidad(idProducto, cambio) {
    const item = carrito.find(
        (producto) => producto.id_producto === idProducto
    );

    if (!item) {
        return;
    }

    const nuevaCantidad = item.cantidad + cambio;

    if (nuevaCantidad <= 0) {
        quitarDelCarrito(idProducto);
        return;
    }

    if (nuevaCantidad > item.stock_actual) {
        mostrarToast(
            "No hay suficiente stock disponible.",
            "error"
        );
        return;
    }

    item.cantidad = nuevaCantidad;
    renderizarCarrito();
}


function quitarDelCarrito(idProducto) {
    carrito = carrito.filter(
        (item) => item.id_producto !== idProducto
    );

    renderizarCarrito();
}


function vaciarCarrito() {
    carrito = [];
    renderizarCarrito();
}


function sincronizarCarrito() {
    carrito = carrito
        .map((item) => {
            const productoActual = productos.find(
                (producto) =>
                    producto.id_producto === item.id_producto
            );

            if (!productoActual) {
                return null;
            }

            const stock = Number(productoActual.stock_actual);

            if (stock <= 0) {
                return null;
            }

            return {
                ...item,
                codigo: productoActual.codigo || "",
                nombre: productoActual.nombre,
                precio_compra:
                    Number(productoActual.precio_compra),
                precio_venta:
                    Number(productoActual.precio_venta),
                stock_actual: stock,
                cantidad: Math.min(item.cantidad, stock)
            };
        })
        .filter(Boolean);

    renderizarCarrito();
}


function renderizarCarrito() {
    const contenedor = document.getElementById("carritoVenta");

    if (!carrito.length) {
        contenedor.innerHTML = `
            <div class="empty-state compact">
                Todavía no agregaste productos.
            </div>
        `;

        document.getElementById("cantidadCarrito").textContent =
            "0";

        document.getElementById("totalCarrito").textContent =
            "0 Gs.";

        document.getElementById("gananciaCarrito").textContent =
            "0 Gs.";

        return;
    }

    contenedor.innerHTML = carrito.map((item) => `
        <div class="cart-item">
            <div>
                <h4>${escaparHTML(item.nombre)}</h4>

                <small class="cart-product-code">
                    ${escaparHTML(item.codigo || "SIN CÓDIGO")}
                </small>

                <small>
                    ${formatearGs(item.precio_venta)}
                    por unidad
                </small>
            </div>

            <div class="quantity-control">
                <button
                    type="button"
                    onclick="cambiarCantidad(
                        '${item.id_producto}',
                        -1
                    )"
                >
                    −
                </button>

                <strong>${item.cantidad}</strong>

                <button
                    type="button"
                    onclick="cambiarCantidad(
                        '${item.id_producto}',
                        1
                    )"
                >
                    +
                </button>

                <button
                    class="remove-cart-item"
                    type="button"
                    onclick="quitarDelCarrito(
                        '${item.id_producto}'
                    )"
                >
                    ×
                </button>
            </div>
        </div>
    `).join("");

    const cantidad = carrito.reduce(
        (total, item) => total + item.cantidad,
        0
    );

    const total = carrito.reduce(
        (suma, item) =>
            suma + item.precio_venta * item.cantidad,
        0
    );

    const ganancia = carrito.reduce(
        (suma, item) =>
            suma
            + (
                item.precio_venta
                - item.precio_compra
            ) * item.cantidad,
        0
    );

    document.getElementById("cantidadCarrito").textContent =
        cantidad;

    document.getElementById("totalCarrito").textContent =
        formatearGs(total);

    document.getElementById("gananciaCarrito").textContent =
        formatearGs(ganancia);
}


// ==========================================
// CONFIRMAR VENTA
// ==========================================

async function confirmarVenta() {
    if (!carrito.length) {
        mostrarToast(
            "Agregá por lo menos un producto.",
            "error"
        );
        return;
    }

    const metodoPago =
        document.getElementById("metodoPago").value;

    const total = carrito.reduce(
        (suma, item) =>
            suma + item.precio_venta * item.cantidad,
        0
    );

    const confirmar = window.confirm(
        `¿Confirmar la venta por ${formatearGs(total)}?`
    );

    if (!confirmar) {
        return;
    }

    const boton = document.getElementById("btnConfirmarVenta");

    boton.disabled = true;
    boton.textContent = "Registrando venta...";

    try {
        const datos = await solicitar("/api/ventas", {
            method: "POST",
            body: JSON.stringify({
                metodo_pago: metodoPago,
                productos: carrito.map((item) => ({
                    id_producto: item.id_producto,
                    cantidad: item.cantidad
                }))
            })
        });

        mostrarToast(
            `Venta registrada: ${formatearGs(
                datos.total_venta
            )}`
        );

        carrito = [];
        renderizarCarrito();

        await Promise.all([
            cargarProductos(),
            cargarResumen(),
            cargarHistorial()
        ]);

        mostrarSeccion("panel");

    } catch (error) {
        mostrarToast(error.message, "error");

    } finally {
        boton.disabled = false;
        boton.textContent = "Confirmar venta";
    }
}


// ==========================================
// RESUMEN
// ==========================================

async function cargarResumen() {
    try {
        const datos = await solicitar("/api/resumen");
        const resumen = datos.resumen;

        document.getElementById("ventaDia").textContent =
            formatearGs(resumen.venta_dia);

        document.getElementById("gananciaDia").textContent =
            formatearGs(resumen.ganancia_dia);

        document.getElementById("ventaMes").textContent =
            formatearGs(resumen.venta_mes);

        document.getElementById("gananciaMes").textContent =
            formatearGs(resumen.ganancia_mes);

        document.getElementById("cantidadVentasDia").textContent =
            `${resumen.cantidad_ventas_dia} ventas registradas`;

        document.getElementById("cantidadVentasMes").textContent =
            `${resumen.cantidad_ventas_mes} ventas registradas`;

        document.getElementById("efectivoDia").textContent =
            formatearGs(resumen.efectivo_dia);

        document.getElementById("transferenciaDia").textContent =
            formatearGs(resumen.transferencia_dia);

        document.getElementById("tarjetaDia").textContent =
            formatearGs(resumen.tarjeta_dia);

        document.getElementById("productosRegistrados").textContent =
            resumen.productos_registrados;

        document.getElementById("unidadesStock").textContent =
            resumen.unidades_stock;

        document.getElementById("productosStockBajo").textContent =
            resumen.productos_stock_bajo;

    } catch (error) {
        mostrarToast(error.message, "error");
    }
}


function renderizarStockBajo() {
    const contenedor = document.getElementById("listaStockBajo");

    const lista = productos.filter(
        (producto) =>
            Number(producto.stock_actual)
            <= Number(producto.stock_minimo)
    );

    if (!lista.length) {
        contenedor.innerHTML = `
            <div class="empty-state compact">
                Todos los productos tienen stock suficiente.
            </div>
        `;

        return;
    }

    contenedor.innerHTML = lista
        .slice(0, 6)
        .map((producto) => `
            <div class="stock-warning">
                <div>
                    <strong>
                        ${escaparHTML(producto.nombre)}
                    </strong>

                    <small>
                        Mínimo configurado:
                        ${producto.stock_minimo}
                    </small>
                </div>

                <span>
                    ${producto.stock_actual} disponibles
                </span>
            </div>
        `)
        .join("");
}


// ==========================================
// HISTORIAL
// ==========================================

async function cargarHistorial() {
    const cuerpo = document.getElementById("tablaHistorial");

    try {
        const datos = await solicitar("/api/ventas");
        const ventas = datos.ventas || [];

        if (!ventas.length) {
            cuerpo.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="empty-state">
                            No hay ventas registradas.
                        </div>
                    </td>
                </tr>
            `;

            return;
        }

        cuerpo.innerHTML = ventas.map((venta) => `
            <tr>
                <td>
                    <strong>
                        ${escaparHTML(venta.ID_VENTA)}
                    </strong>
                </td>

                <td>${escaparHTML(venta.FECHA)}</td>

                <td>${escaparHTML(venta.HORA)}</td>

                <td>
                    <span class="badge neutral">
                        ${escaparHTML(venta.METODO_PAGO)}
                    </span>
                </td>

                <td>
                    ${venta.CANTIDAD_PRODUCTOS}
                </td>

                <td>
                    <strong>
                        ${formatearGs(venta.TOTAL_VENTA)}
                    </strong>
                </td>

                <td class="price-profit">
                    ${formatearGs(venta.GANANCIA)}
                </td>
            </tr>
        `).join("");

    } catch (error) {
        cuerpo.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="empty-state">
                        No se pudo cargar el historial.
                    </div>
                </td>
            </tr>
        `;

        mostrarToast(error.message, "error");
    }
}


// ==========================================
// REPORTES MENSUALES
// ==========================================

async function cargarReporteMensual() {
    const mes = document.getElementById("reporteMes").value;

    if (!mes) {
        mostrarToast("Seleccioná un mes para el reporte.", "error");
        return;
    }

    const boton = document.getElementById("btnCargarReporte");
    boton.disabled = true;
    boton.textContent = "Cargando...";

    try {
        const datos = await solicitar(
            `/api/reportes/mensual?mes=${encodeURIComponent(mes)}`
        );
        const totales = datos.totales;

        const [anio, numeroMes] = mes.split("-").map(Number);
        const nombreMes = new Date(anio, numeroMes - 1, 1)
            .toLocaleDateString("es-PY", {
                month: "long",
                year: "numeric"
            });

        document.getElementById("reportePeriodoTexto").textContent =
            nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);

        document.getElementById("reporteTotalVendido").textContent =
            formatearGs(totales.total_vendido);
        document.getElementById("reporteGanancia").textContent =
            formatearGs(totales.ganancia);
        document.getElementById("reporteCostoTotal").textContent =
            formatearGs(totales.costo_total);
        document.getElementById("reporteProductosVendidos").textContent =
            totales.cantidad_productos;
        document.getElementById("reporteCantidadVentas").textContent =
            `${totales.cantidad_ventas} ventas registradas`;
        document.getElementById("reporteEfectivo").textContent =
            formatearGs(totales.efectivo);
        document.getElementById("reporteTransferencia").textContent =
            formatearGs(totales.transferencia);
        document.getElementById("reporteTarjeta").textContent =
            formatearGs(totales.tarjeta);

        renderizarRankingReporte(datos.productos_mas_vendidos || []);
        renderizarVentasReporte(datos.ventas || []);

    } catch (error) {
        mostrarToast(error.message, "error");
    } finally {
        boton.disabled = false;
        boton.textContent = "Ver reporte";
    }
}


function renderizarRankingReporte(lista) {
    const contenedor = document.getElementById("reporteTopProductos");

    if (!lista.length) {
        contenedor.innerHTML = `
            <div class="empty-state compact">
                No hay productos vendidos durante este mes.
            </div>
        `;
        return;
    }

    contenedor.innerHTML = lista.map((producto, indice) => `
        <div class="ranking-item">
            <span class="ranking-position">${indice + 1}</span>
            <div class="ranking-product">
                <strong>${escaparHTML(producto.producto)}</strong>
                <small>
                    ${producto.cantidad} unidades ·
                    ${formatearGs(producto.total_vendido)}
                </small>
            </div>
            <span class="ranking-profit">
                +${formatearGs(producto.ganancia)}
            </span>
        </div>
    `).join("");
}


function renderizarVentasReporte(ventas) {
    const cuerpo = document.getElementById("tablaReporteVentas");

    if (!ventas.length) {
        cuerpo.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="empty-state">
                        No hay ventas registradas durante este mes.
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    cuerpo.innerHTML = ventas.map((venta) => `
        <tr>
            <td><strong>${escaparHTML(venta.ID_VENTA)}</strong></td>
            <td>${escaparHTML(venta.FECHA)}</td>
            <td>${escaparHTML(venta.HORA)}</td>
            <td>
                <span class="badge neutral">
                    ${escaparHTML(venta.METODO_PAGO)}
                </span>
            </td>
            <td>${venta.CANTIDAD_PRODUCTOS}</td>
            <td><strong>${formatearGs(venta.TOTAL_VENTA)}</strong></td>
            <td class="price-profit">
                ${formatearGs(venta.GANANCIA)}
            </td>
        </tr>
    `).join("");
}
