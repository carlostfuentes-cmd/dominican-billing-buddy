export const PUENTE_PHP = String.raw`<?php
// ============================================================================
// Puente seguro entre la aplicación publicada y tu base de datos MySQL/MariaDB.
//
// 1. Completa los datos de conexión y la CLAVE de abajo.
// 2. Sube este archivo a tu servidor web (por ejemplo:
//    https://midominio.com/erp/puente-mysql.php). Debe estar accesible por HTTPS.
// 3. Guarda en el proyecto de Lovable los valores protegidos:
//      MYSQL_BRIDGE_URL   = la dirección completa de este archivo
//      MYSQL_BRIDGE_TOKEN = exactamente la misma CLAVE definida aquí abajo
//
// Solo acepta peticiones que traigan la clave correcta.
// ============================================================================

$TOKEN    = 'PON-AQUI-UNA-CLAVE-LARGA-Y-SECRETA';
$HOST     = '127.0.0.1';
$PORT     = 3306;
$DATABASE = 'nombre_de_tu_base';
$USER     = 'usuario';
$PASSWORD = 'contrasena';

header('Content-Type: application/json; charset=utf-8');

function salir($codigo, $datos) {
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}

// --- Autenticación ----------------------------------------------------------
$cabecera = '';
if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
    $cabecera = $_SERVER['HTTP_AUTHORIZATION'];
} elseif (function_exists('apache_request_headers')) {
    $h = apache_request_headers();
    if (isset($h['Authorization'])) { $cabecera = $h['Authorization']; }
}
$recibido = preg_replace('/^Bearer\s+/i', '', trim($cabecera));
if ($TOKEN === '' || !hash_equals($TOKEN, $recibido)) {
    salir(401, array('error' => 'No autorizado'));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    salir(405, array('error' => 'Método no permitido'));
}

$cuerpo = json_decode(file_get_contents('php://input'), true);
if (!is_array($cuerpo)) {
    salir(400, array('error' => 'Petición inválida'));
}

// Comprobación de estado sin consultar nada.
if (isset($cuerpo['ping'])) {
    salir(200, array('ok' => true));
}

$sql    = isset($cuerpo['sql']) ? $cuerpo['sql'] : '';
$params = isset($cuerpo['params']) && is_array($cuerpo['params']) ? $cuerpo['params'] : array();
if (!is_string($sql) || $sql === '') {
    salir(400, array('error' => 'Consulta vacía'));
}

// --- Conexión ---------------------------------------------------------------
mysqli_report(MYSQLI_REPORT_OFF);
$con = @new mysqli($HOST, $USER, $PASSWORD, $DATABASE, (int) $PORT);
if ($con->connect_error) {
    salir(500, array('error' => 'Sin conexión a la base de datos'));
}
$con->set_charset('utf8mb4');

// --- Ejecución con parámetros ----------------------------------------------
$stmt = $con->prepare($sql);
if ($stmt === false) {
    salir(400, array('error' => $con->error));
}

if (count($params) > 0) {
    $tipos = '';
    $valores = array();
    foreach ($params as $p) {
        if (is_int($p)) { $tipos .= 'i'; }
        elseif (is_float($p)) { $tipos .= 'd'; }
        elseif (is_null($p)) { $tipos .= 's'; $p = null; }
        else { $tipos .= 's'; $p = (string) $p; }
        $valores[] = $p;
    }
    $refs = array();
    $refs[] = &$tipos;
    for ($i = 0; $i < count($valores); $i++) {
        $refs[] = &$valores[$i];
    }
    call_user_func_array(array($stmt, 'bind_param'), $refs);
}

if (!$stmt->execute()) {
    salir(400, array('error' => $stmt->error));
}

$filas = array();
$res = $stmt->get_result();
if ($res instanceof mysqli_result) {
    while ($f = $res->fetch_assoc()) { $filas[] = $f; }
    $res->free();
}

salir(200, array(
    'rows'         => $filas,
    'insertId'     => (int) $stmt->insert_id,
    'affectedRows' => (int) $stmt->affected_rows,
));
`;
