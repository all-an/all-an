<?php
/**
 * The base configuration for WordPress
 *
 * The wp-config.php creation script uses this file during the
 * installation. You don't have to use the web site, you can
 * copy this file to "wp-config.php" and fill in the values.
 *
 * This file contains the following configurations:
 *
 * * MySQL settings
 * * Secret keys
 * * Database table prefix
 * * ABSPATH
 *
 * @link https://codex.wordpress.org/Editing_wp-config.php
 *
 * @package WordPress
 */

// ** MySQL settings - You can get this info from your web host ** //
/** The name of the database for WordPress */
define( 'DB_NAME', 'alura' );

/** MySQL database username */
define( 'DB_USER', 'root' );

/** MySQL database password */
define( 'DB_PASSWORD', '' );

/** MySQL hostname */
define( 'DB_HOST', 'localhost' );

/** Database Charset to use in creating database tables. */
define( 'DB_CHARSET', 'utf8mb4' );

/** The Database Collate type. Don't change this if in doubt. */
define( 'DB_COLLATE', '' );

/**#@+
 * Authentication Unique Keys and Salts.
 *
 * Change these to different unique phrases!
 * You can generate these using the {@link https://api.wordpress.org/secret-key/1.1/salt/ WordPress.org secret-key service}
 * You can change these at any point in time to invalidate all existing cookies. This will force all users to have to log in again.
 *
 * @since 2.6.0
 */
define( 'AUTH_KEY',         'B|D~p::]H|l5cF`1I8b%I8|aiv&bZT({#_eguXO2j2$`=Ug)*NsrH{Sf4VnFK)i$' );
define( 'SECURE_AUTH_KEY',  'm5qcDRv0HcaJWwzojpvH/+VI!9Ad%OmmsJ+i3(Y`Y[ %Sz%0Fb@P(E#(K*v*qgCy' );
define( 'LOGGED_IN_KEY',    'Lz%Bw)Uh,J%[Bm7TDwiOKFcSi-~_4a0t5<e7=B.[72z$^t5Ll7um$`y)!::A^0[h' );
define( 'NONCE_KEY',        '<:>L1:P$OZKMsI5#1K;(Ear&:TAAu}*D}0#ok?P_4NxUbf[/[()WzyT5bKD2LZD7' );
define( 'AUTH_SALT',        '8nBeF<}4xX7tyB85>2CI8jThRpEdQf*&WA|qpGlA8{578@vG-3tl+!mJ.n!?s5=9' );
define( 'SECURE_AUTH_SALT', 'q:pu6&fXJK]%3)aG/% {*^c><BDC+- Sw].^FI;v31Rhb%vIUGg.V.o$M]!Cvk; ' );
define( 'LOGGED_IN_SALT',   'x@^PX^e^?W*:$)p8>RJxVtmac&2eoF{x##^V^r&izAeA3mf=k~4OQX/l*<{XTN9@' );
define( 'NONCE_SALT',       'iszwqoHt,X3?9]cpJ WDYP>BX(kb%XL/hud8YT;*?2cmc%&):{)enqHHxKwL{LmL' );

/**#@-*/

/**
 * WordPress Database Table prefix.
 *
 * You can have multiple installations in one database if you give each
 * a unique prefix. Only numbers, letters, and underscores please!
 */
$table_prefix = 'wp_';

/**
 * For developers: WordPress debugging mode.
 *
 * Change this to true to enable the display of notices during development.
 * It is strongly recommended that plugin and theme developers use WP_DEBUG
 * in their development environments.
 *
 * For information on other constants that can be used for debugging,
 * visit the Codex.
 *
 * @link https://codex.wordpress.org/Debugging_in_WordPress
 */
define( 'WP_DEBUG', false );

/* That's all, stop editing! Happy publishing. */

/** Absolute path to the WordPress directory. */
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', dirname( __FILE__ ) . '/' );
}

/** Sets up WordPress vars and included files. */
require_once( ABSPATH . 'wp-settings.php' );
