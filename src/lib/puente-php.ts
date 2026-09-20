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

// --- Envío de correo (SMTP) -------------------------------------------------
function smtp_leer($fp) {
    $texto = '';
    while (($linea = fgets($fp, 1024)) !== false) {
        $texto .= $linea;
        if (strlen($linea) < 4 || substr($linea, 3, 1) === ' ') { break; }
    }
    return $texto;
}

function smtp_decir($fp, $orden, $esperado) {
    if ($orden !== null) { fwrite($fp, $orden . "\r\n"); }
    $respuesta = smtp_leer($fp);
    $codigo = (int) substr(trim($respuesta), 0, 3);
    if (!in_array($codigo, $esperado, true)) {
        return 'Servidor de correo: ' . trim($respuesta);
    }
    return true;
}

function enviar_correo($m) {
    $host    = isset($m['host']) ? trim($m['host']) : '';
    $puerto  = isset($m['port']) ? (int) $m['port'] : 25;
    $usuario = isset($m['user']) ? $m['user'] : '';
    $clave   = isset($m['password']) ? $m['password'] : '';
    $de      = isset($m['from']) ? trim($m['from']) : '';
    $deNom   = isset($m['fromName']) ? $m['fromName'] : '';
    $asunto  = isset($m['subject']) ? $m['subject'] : '';
    $html    = isset($m['html']) ? $m['html'] : '';
    $auth    = !empty($m['auth']);
    $ssl     = !empty($m['ssl']);
    $para    = array();
    if (isset($m['to'])) { $para = is_array($m['to']) ? $m['to'] : array($m['to']); }
    $copia   = array();
    if (isset($m['cc'])) { $copia = is_array($m['cc']) ? $m['cc'] : array($m['cc']); }
    $anexos  = isset($m['attachments']) && is_array($m['attachments']) ? $m['attachments'] : array();

    if ($host === '' || $de === '' || count($para) === 0) {
        return 'Faltan datos del correo (servidor, remitente o destinatario)';
    }

    $destino = ($ssl && $puerto === 465 ? 'ssl://' : '') . $host . ':' . $puerto;
    $fp = @stream_socket_client($destino, $eno, $estr, 20);
    if (!$fp) { return 'No se pudo conectar al servidor de correo: ' . $estr; }
    stream_set_timeout($fp, 20);

    $r = smtp_decir($fp, null, array(220));
    if ($r !== true) { fclose($fp); return $r; }
    $r = smtp_decir($fp, 'EHLO ' . (isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost'), array(250));
    if ($r !== true) { fclose($fp); return $r; }

    if ($ssl && $puerto !== 465) {
        $r = smtp_decir($fp, 'STARTTLS', array(220));
        if ($r !== true) { fclose($fp); return $r; }
        if (!@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            fclose($fp); return 'No se pudo activar el cifrado TLS';
        }
        $r = smtp_decir($fp, 'EHLO ' . (isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'localhost'), array(250));
        if ($r !== true) { fclose($fp); return $r; }
    }

    if ($auth) {
        $r = smtp_decir($fp, 'AUTH LOGIN', array(334));
        if ($r !== true) { fclose($fp); return $r; }
        $r = smtp_decir($fp, base64_encode($usuario), array(334));
        if ($r !== true) { fclose($fp); return $r; }
        $r = smtp_decir($fp, base64_encode($clave), array(235));
        if ($r !== true) { fclose($fp); return 'Usuario o clave de correo incorrectos'; }
    }

    $r = smtp_decir($fp, 'MAIL FROM:<' . $de . '>', array(250));
    if ($r !== true) { fclose($fp); return $r; }
    foreach (array_merge($para, $copia) as $dir) {
        $dir = trim($dir);
        if ($dir === '') { continue; }
        $r = smtp_decir($fp, 'RCPT TO:<' . $dir . '>', array(250, 251));
        if ($r !== true) { fclose($fp); return $r; }
    }
    $r = smtp_decir($fp, 'DATA', array(354));
    if ($r !== true) { fclose($fp); return $r; }

    $limite = 'lim' . md5(uniqid('', true));
    $cab  = 'From: ' . ($deNom !== '' ? '=?UTF-8?B?' . base64_encode($deNom) . '?= ' : '') . '<' . $de . '>' . "\r\n";
    $cab .= 'To: ' . implode(', ', $para) . "\r\n";
    if (count($copia) > 0) { $cab .= 'Cc: ' . implode(', ', $copia) . "\r\n"; }
    $cab .= 'Subject: =?UTF-8?B?' . base64_encode($asunto) . '?=' . "\r\n";
    $cab .= 'Date: ' . date('r') . "\r\n";
    $cab .= 'MIME-Version: 1.0' . "\r\n";
    $cab .= 'Content-Type: multipart/mixed; boundary="' . $limite . '"' . "\r\n\r\n";

    $cuerpoMail  = '--' . $limite . "\r\n";
    $cuerpoMail .= 'Content-Type: text/html; charset=UTF-8' . "\r\n";
    $cuerpoMail .= 'Content-Transfer-Encoding: base64' . "\r\n\r\n";
    $cuerpoMail .= chunk_split(base64_encode($html)) . "\r\n";

    foreach ($anexos as $a) {
        $nombre = isset($a['filename']) ? $a['filename'] : 'documento.pdf';
        $tipo   = isset($a['contentType']) ? $a['contentType'] : 'application/pdf';
        $datos  = isset($a['base64']) ? preg_replace('/\s+/', '', $a['base64']) : '';
        if ($datos === '') { continue; }
        $cuerpoMail .= '--' . $limite . "\r\n";
        $cuerpoMail .= 'Content-Type: ' . $tipo . '; name="' . $nombre . '"' . "\r\n";
        $cuerpoMail .= 'Content-Transfer-Encoding: base64' . "\r\n";
        $cuerpoMail .= 'Content-Disposition: attachment; filename="' . $nombre . '"' . "\r\n\r\n";
        $cuerpoMail .= chunk_split($datos) . "\r\n";
    }
    $cuerpoMail .= '--' . $limite . '--' . "\r\n";

    $mensaje = preg_replace('/^\./m', '..', $cab . $cuerpoMail);
    fwrite($fp, $mensaje . "\r\n.\r\n");
    $r = smtp_decir($fp, null, array(250));
    if ($r !== true) { fclose($fp); return $r; }
    smtp_decir($fp, 'QUIT', array(221, 250));
    fclose($fp);
    return true;
}

// Envío de correo solicitado por la aplicación.
if (isset($cuerpo['mail']) && is_array($cuerpo['mail'])) {
    $resultado = enviar_correo($cuerpo['mail']);
    if ($resultado === true) { salir(200, array('ok' => true)); }
    salir(400, array('error' => $resultado));
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
