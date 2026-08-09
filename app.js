const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");

const app = express();

const PORT = process.env.PORT || 3000;

// =====================================================
// TRUST PROXY - RENDER
// =====================================================

app.set("trust proxy", 1);

// =====================================================
// POSTGRESQL
// =====================================================

if (!process.env.DATABASE_URL) {
    console.warn("WARNING: DATABASE_URL belum tersedia.");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL
        ? { rejectUnauthorized: false }
        : false
});

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        secret:
            process.env.SESSION_SECRET ||
            "world-football-forum-secret",

        resave: false,

        saveUninitialized: false,

        cookie: {
            secure: process.env.NODE_ENV === "production",
            httpOnly: true,
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24 * 7
        }
    })
);

app.use(express.static("public"));

app.set("view engine", "ejs");

// =====================================================
// KATEGORI
// =====================================================

const VALID_CATEGORIES = [
    "berita",
    "transfer",
    "kompetisi",
    "komunitas",
    "premier-league",
    "la-liga",
    "serie-a",
    "bundesliga",
    "ligue-1",
    "champions-league",
    "world-cup"
];

// =====================================================
// HELPER - CEK BCRYPT
// =====================================================

function isBcryptHash(password) {
    return (
        typeof password === "string" &&
        (
            password.startsWith("$2a$") ||
            password.startsWith("$2b$") ||
            password.startsWith("$2y$")
        )
    );
}

// =====================================================
// DATABASE SETUP
// =====================================================

async function initDatabase() {

    if (!process.env.DATABASE_URL) {
        console.log(
            "Database belum terhubung. DATABASE_URL tidak ditemukan."
        );

        return;
    }

    try {

        // =================================================
        // USERS
        // =================================================

        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id BIGINT PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        `);

        // =================================================
        // THREADS
        // =================================================

        await pool.query(`
            CREATE TABLE IF NOT EXISTS threads (
                id BIGINT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                category VARCHAR(100) NOT NULL,
                author VARCHAR(100) NOT NULL,
                date TEXT NOT NULL,
                views INTEGER DEFAULT 0
            )
        `);

        // =================================================
        // COMMENTS
        // =================================================

        await pool.query(`
            CREATE TABLE IF NOT EXISTS comments (
                id BIGSERIAL PRIMARY KEY,
                thread_id BIGINT NOT NULL
                    REFERENCES threads(id)
                    ON DELETE CASCADE,
                author VARCHAR(100) NOT NULL,
                text TEXT NOT NULL,
                date TEXT NOT NULL
            )
        `);

        console.log("PostgreSQL database siap.");

        // =================================================
        // USER DODO
        // =================================================

        const existingUser = await pool.query(
            `
            SELECT
                id,
                username,
                password
            FROM users
            WHERE username = $1
            `,
            ["dodo"]
        );

        if (existingUser.rows.length === 0) {

            const hashedPassword =
                await bcrypt.hash("123456", 12);

            await pool.query(
                `
                INSERT INTO users
                (id, username, password)
                VALUES ($1, $2, $3)
                `,
                [
                    1786147459509,
                    "dodo",
                    hashedPassword
                ]
            );

            console.log(
                "User dodo berhasil dibuat dengan password bcrypt."
            );

        } else {

            const user = existingUser.rows[0];

            if (!isBcryptHash(user.password)) {

                const hashedPassword =
                    await bcrypt.hash(
                        user.password,
                        12
                    );

                await pool.query(
                    `
                    UPDATE users
                    SET password = $1
                    WHERE id = $2
                    `,
                    [
                        hashedPassword,
                        user.id
                    ]
                );

                console.log(
                    "Password user dodo berhasil diamankan dengan bcrypt."
                );

            } else {

                console.log(
                    "User dodo sudah ada dan password sudah aman."
                );
            }
        }

    } catch (error) {

        console.error(
            "DATABASE ERROR:",
            error
        );
    }
}

// =====================================================
// HOME
// =====================================================

app.get("/", async (req, res) => {

    try {

        console.log(
            "HOME SESSION:",
            req.session.username
        );

        const result = await pool.query(`
            SELECT
                t.id,
                t.title,
                t.content,
                t.category,
                t.author,
                t.date,
                t.views,
                COUNT(c.id)::INTEGER AS comment_count
            FROM threads t
            LEFT JOIN comments c
                ON c.thread_id = t.id
            GROUP BY
                t.id,
                t.title,
                t.content,
                t.category,
                t.author,
                t.date,
                t.views
            ORDER BY t.id DESC
            LIMIT 10
        `);

        const threads = result.rows;

        res.render("index", {
            user: req.session.username,
            threads
        });

    } catch (error) {

        console.error(
            "HOME ERROR:",
            error
        );

        res.status(500).send(
            "Terjadi kesalahan pada database."
        );
    }
});

// =====================================================
// CATEGORY
// =====================================================

app.get("/category/:name", async (req, res) => {

    try {

        const categoryName =
            req.params.name.toLowerCase();

        if (!VALID_CATEGORIES.includes(categoryName)) {

            return res.status(404).send(
                "Kategori tidak ditemukan."
            );
        }

        const result = await pool.query(
            `
            SELECT
                t.id,
                t.title,
                t.content,
                t.category,
                t.author,
                t.date,
                t.views,
                COUNT(c.id)::INTEGER AS comment_count
            FROM threads t
            LEFT JOIN comments c
                ON c.thread_id = t.id
            WHERE t.category = $1
            GROUP BY
                t.id,
                t.title,
                t.content,
                t.category,
                t.author,
                t.date,
                t.views
            ORDER BY t.id DESC
            LIMIT 10
            `,
            [categoryName]
        );

        res.render("category", {
            category: categoryName,
            threads: result.rows,
            user: req.session.username
        });

    } catch (error) {

        console.error(
            "CATEGORY ERROR:",
            error
        );

        res.status(500).send(
            "Terjadi kesalahan pada database."
        );
    }
});

// =====================================================
// CREATE THREAD - FORM
// =====================================================

app.get("/create", (req, res) => {

    if (!req.session.username) {
        return res.redirect("/login");
    }

    res.render("create", {
        user: req.session.username,
        categories: VALID_CATEGORIES
    });
});

// =====================================================
// CREATE THREAD
// =====================================================

app.post("/create", async (req, res) => {

    try {

        if (!req.session.username) {
            return res.redirect("/login");
        }

        const title =
            String(req.body.title || "").trim();

        const content =
            String(req.body.content || "").trim();

        const category =
            String(req.body.category || "")
                .trim()
                .toLowerCase();

        if (!title) {
            return res.send(
                "Judul thread wajib diisi."
            );
        }

        if (!content) {
            return res.send(
                "Isi thread wajib diisi."
            );
        }

        if (!VALID_CATEGORIES.includes(category)) {
            return res.send(
                "Kategori tidak valid."
            );
        }

        const threadId = Date.now();

        const date =
            new Date().toLocaleDateString();

        await pool.query(
            `
            INSERT INTO threads
            (id, title, content, category, author, date, views)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
                threadId,
                title,
                content,
                category,
                req.session.username,
                date,
                0
            ]
        );

        res.redirect(
            "/thread/" + threadId
        );

    } catch (error) {

        console.error(
            "CREATE THREAD ERROR:",
            error
        );

        res.status(500).send(
            "Gagal membuat thread."
        );
    }
});

// =====================================================
// THREAD DETAIL
// =====================================================

app.get("/thread/:id", async (req, res) => {

    try {

        const threadResult =
            await pool.query(
                `
                SELECT
                    id,
                    title,
                    content,
                    category,
                    author,
                    date,
                    views
                FROM threads
                WHERE id = $1
                `,
                [req.params.id]
            );

        if (threadResult.rows.length === 0) {

            return res.send(
                "Thread tidak ditemukan."
            );
        }

        const thread =
            threadResult.rows[0];

        await pool.query(
            `
            UPDATE threads
            SET views = views + 1
            WHERE id = $1
            `,
            [req.params.id]
        );

        thread.views =
            Number(thread.views || 0) + 1;

        const commentsResult =
            await pool.query(
                `
                SELECT
                    id,
                    author,
                    text,
                    date
                FROM comments
                WHERE thread_id = $1
                ORDER BY id ASC
                `,
                [req.params.id]
            );

        res.render("thread", {

            id: thread.id,

            title: thread.title,

            content: thread.content,

            category: thread.category,

            author: thread.author,

            date: thread.date,

            views: thread.views,

            comments: commentsResult.rows,

            user: req.session.username
        });

    } catch (error) {

        console.error(
            "THREAD ERROR:",
            error
        );

        res.status(500).send(
            "Gagal membuka thread."
        );
    }
});

// =====================================================
// ADD COMMENT
// =====================================================

app.post("/thread/:id/comment", async (req, res) => {

    try {

        if (!req.session.username) {
            return res.redirect("/login");
        }

        const threadResult =
            await pool.query(
                "SELECT id FROM threads WHERE id = $1",
                [req.params.id]
            );

        if (threadResult.rows.length === 0) {

            return res.send(
                "Thread tidak ditemukan."
            );
        }

        const commentText =
            String(req.body.comment || "").trim();

        if (!commentText) {

            return res.send(
                "Komentar tidak boleh kosong."
            );
        }

        await pool.query(
            `
            INSERT INTO comments
            (thread_id, author, text, date)
            VALUES ($1, $2, $3, $4)
            `,
            [
                req.params.id,
                req.session.username,
                commentText,
                new Date().toLocaleDateString()
            ]
        );

        res.redirect(
            "/thread/" + req.params.id
        );

    } catch (error) {

        console.error(
            "COMMENT ERROR:",
            error
        );

        res.status(500).send(
            "Gagal menambahkan komentar."
        );
    }
});

// =====================================================
// DELETE COMMENT
// =====================================================

app.post(
    "/thread/:id/comment/delete/:commentIndex",
    async (req, res) => {

        try {

            if (!req.session.username) {
                return res.redirect("/login");
            }

            const commentsResult =
                await pool.query(
                    `
                    SELECT
                        id,
                        author
                    FROM comments
                    WHERE thread_id = $1
                    ORDER BY id ASC
                    `,
                    [req.params.id]
                );

            const commentIndex =
                parseInt(
                    req.params.commentIndex,
                    10
                );

            if (
                isNaN(commentIndex) ||
                commentIndex < 0 ||
                commentIndex >= commentsResult.rows.length
            ) {

                return res.send(
                    "Komentar tidak ditemukan."
                );
            }

            const comment =
                commentsResult.rows[commentIndex];

            if (
                comment.author !==
                req.session.username
            ) {

                return res.status(403).send(
                    "Kamu tidak boleh menghapus komentar ini."
                );
            }

            await pool.query(
                `
                DELETE FROM comments
                WHERE id = $1
                `,
                [comment.id]
            );

            res.redirect(
                "/thread/" + req.params.id
            );

        } catch (error) {

            console.error(
                "DELETE COMMENT ERROR:",
                error
            );

            res.status(500).send(
                "Gagal menghapus komentar."
            );
        }
    }
);

// =====================================================
// DELETE THREAD
// =====================================================

app.post("/thread/:id/delete", async (req, res) => {

    try {

        if (!req.session.username) {
            return res.redirect("/login");
        }

        const result =
            await pool.query(
                `
                SELECT author
                FROM threads
                WHERE id = $1
                `,
                [req.params.id]
            );

        if (result.rows.length === 0) {

            return res.send(
                "Thread tidak ditemukan."
            );
        }

        const thread =
            result.rows[0];

        if (
            thread.author !==
            req.session.username
        ) {

            return res.status(403).send(
                "Kamu tidak boleh menghapus thread ini."
            );
        }

        await pool.query(
            `
            DELETE FROM threads
            WHERE id = $1
            `,
            [req.params.id]
        );

        res.redirect("/");

    } catch (error) {

        console.error(
            "DELETE THREAD ERROR:",
            error
        );

        res.status(500).send(
            "Gagal menghapus thread."
        );
    }
});

// =====================================================
// LOGIN - FORM
// =====================================================

app.get("/login", (req, res) => {

    res.render("login");
});

// =====================================================
// LOGIN
// =====================================================

app.post("/login", async (req, res) => {

    try {

        const username =
            String(req.body.username || "").trim();

        const password =
            String(req.body.password || "");

        if (!username || !password) {

            return res.send(
                "Username dan password wajib diisi."
            );
        }

        const result =
            await pool.query(
                `
                SELECT
                    id,
                    username,
                    password
                FROM users
                WHERE username = $1
                `,
                [username]
            );

        if (result.rows.length === 0) {

            return res.send(
                "Username atau password salah."
            );
        }

        const user =
            result.rows[0];

        let passwordMatch = false;

        if (isBcryptHash(user.password)) {

            passwordMatch =
                await bcrypt.compare(
                    password,
                    user.password
                );

        } else {

            passwordMatch =
                password === user.password;

            if (passwordMatch) {

                const hashedPassword =
                    await bcrypt.hash(
                        password,
                        12
                    );

                await pool.query(
                    `
                    UPDATE users
                    SET password = $1
                    WHERE id = $2
                    `,
                    [
                        hashedPassword,
                        user.id
                    ]
                );

                console.log(
                    "Password lama berhasil dimigrasikan ke bcrypt."
                );
            }
        }

        if (!passwordMatch) {

            return res.send(
                "Username atau password salah."
            );
        }

        req.session.userId =
            user.id;

        req.session.username =
            user.username;

        req.session.save((err) => {

            if (err) {

                console.error(
                    "SESSION ERROR:",
                    err
                );

                return res.send(
                    "Session gagal disimpan."
                );
            }

            console.log(
                "USER LOGIN:",
                req.session.username
            );

            console.log(
                "SESSION BERHASIL"
            );

            res.redirect("/");
        });

    } catch (error) {

        console.error(
            "LOGIN ERROR:",
            error
        );

        res.status(500).send(
            "Gagal login."
        );
    }
});

// =====================================================
// PROFILE
// =====================================================

app.get("/profile", async (req, res) => {

    try {

        if (!req.session.username) {
            return res.redirect("/login");
        }

        // =================================================
        // DATA USER
        // =================================================

        const userResult = await pool.query(
            `
            SELECT
                id,
                username
            FROM users
            WHERE id = $1
            `,
            [req.session.userId]
        );

        if (userResult.rows.length === 0) {
            return res.redirect("/logout");
        }

        const user = userResult.rows[0];

        // =================================================
        // STATISTIK THREAD
        // =================================================

        const threadStatsResult = await pool.query(
            `
            SELECT
                COUNT(*)::INTEGER AS thread_count,
                COALESCE(SUM(views), 0)::INTEGER AS total_views
            FROM threads
            WHERE author = $1
            `,
            [user.username]
        );

        const threadStats = threadStatsResult.rows[0];

        // =================================================
        // STATISTIK KOMENTAR
        // =================================================

        const commentStatsResult = await pool.query(
            `
            SELECT
                COUNT(*)::INTEGER AS comment_count
            FROM comments
            WHERE author = $1
            `,
            [user.username]
        );

        const commentStats = commentStatsResult.rows[0];

        // =================================================
        // DAFTAR THREAD MILIK USER
        // =================================================

        const threadsResult = await pool.query(
            `
            SELECT
                t.id,
                t.title,
                t.category,
                t.date,
                t.views,
                COUNT(c.id)::INTEGER AS comment_count
            FROM threads t
            LEFT JOIN comments c
                ON c.thread_id = t.id
            WHERE t.author = $1
            GROUP BY
                t.id,
                t.title,
                t.category,
                t.date,
                t.views
            ORDER BY t.id DESC
            `,
            [user.username]
        );

        // =================================================
        // RENDER PROFILE
        // =================================================

        res.render("profile", {

            user: user.username,

            userId: user.id,

            threadCount:
                threadStats.thread_count,

            commentCount:
                commentStats.comment_count,

            totalViews:
                threadStats.total_views,

            threads:
                threadsResult.rows

        });

    } catch (error) {

        console.error(
            "PROFILE ERROR:",
            error
        );

        res.status(500).send(
            "Gagal membuka profil."
        );
    }
});

// =====================================================
// CHANGE PASSWORD
// =====================================================

app.post(
    "/profile/change-password",
    async (req, res) => {

        try {

            if (!req.session.username) {
                return res.redirect("/login");
            }

            const currentPassword =
                String(
                    req.body.currentPassword || ""
                );

            const newPassword =
                String(
                    req.body.newPassword || ""
                );

            const confirmPassword =
                String(
                    req.body.confirmPassword || ""
                );

            if (!currentPassword) {

                return res.send(
                    "Password lama wajib diisi."
                );
            }

            if (!newPassword) {

                return res.send(
                    "Password baru wajib diisi."
                );
            }

            if (newPassword.length < 6) {

                return res.send(
                    "Password baru minimal 6 karakter."
                );
            }

            if (newPassword.length > 72) {

                return res.send(
                    "Password baru maksimal 72 karakter."
                );
            }

            if (newPassword !== confirmPassword) {

                return res.send(
                    "Konfirmasi password baru tidak sama."
                );
            }

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        username,
                        password
                    FROM users
                    WHERE id = $1
                    `,
                    [req.session.userId]
                );

            if (result.rows.length === 0) {
                return res.redirect("/logout");
            }

            const user =
                result.rows[0];

            if (!isBcryptHash(user.password)) {

                return res.send(
                    "Password akun belum menggunakan sistem keamanan bcrypt. Silakan logout dan login kembali."
                );
            }

            const passwordMatch =
                await bcrypt.compare(
                    currentPassword,
                    user.password
                );

            if (!passwordMatch) {

                return res.send(
                    "Password lama salah."
                );
            }

            if (currentPassword === newPassword) {

                return res.send(
                    "Password baru harus berbeda dari password lama."
                );
            }

            const hashedPassword =
                await bcrypt.hash(
                    newPassword,
                    12
                );

            await pool.query(
                `
                UPDATE users
                SET password = $1
                WHERE id = $2
                `,
                [
                    hashedPassword,
                    user.id
                ]
            );

            console.log(
                "PASSWORD BERHASIL DIUBAH:",
                user.username
            );

            res.redirect("/profile");

        } catch (error) {

            console.error(
                "CHANGE PASSWORD ERROR:",
                error
            );

            res.status(500).send(
                "Gagal mengubah password."
            );
        }
    }
);

// =====================================================
// LOGOUT
// =====================================================

app.get("/logout", (req, res) => {

    req.session.destroy((err) => {

        if (err) {

            console.error(
                "LOGOUT ERROR:",
                err
            );

            return res.send(
                "Gagal logout."
            );
        }

        res.redirect("/");
    });
});

// =====================================================
// REGISTER - FORM
// =====================================================

app.get("/register", (req, res) => {

    res.render("register");
});

// =====================================================
// REGISTER
// =====================================================

app.post("/register", async (req, res) => {

    try {

        const username =
            String(req.body.username || "").trim();

        const password =
            String(req.body.password || "");

        const confirmPassword =
            String(req.body.confirmPassword || "");

        if (!username) {

            return res.send(
                "Username wajib diisi."
            );
        }

        if (username.length < 3) {

            return res.send(
                "Username minimal 3 karakter."
            );
        }

        if (username.length > 100) {

            return res.send(
                "Username terlalu panjang."
            );
        }

        if (!password) {

            return res.send(
                "Password wajib diisi."
            );
        }

        if (password.length < 6) {

            return res.send(
                "Password minimal 6 karakter."
            );
        }

        if (password.length > 72) {

            return res.send(
                "Password maksimal 72 karakter."
            );
        }

        if (password !== confirmPassword) {

            return res.send(
                "Password dan konfirmasi password tidak sama."
            );
        }

        const existingUser =
            await pool.query(
                `
                SELECT id
                FROM users
                WHERE username = $1
                `,
                [username]
            );

        if (existingUser.rows.length > 0) {

            return res.send(
                "Username sudah digunakan."
            );
        }

        const newUserId =
            Date.now();

        const hashedPassword =
            await bcrypt.hash(
                password,
                12
            );

        await pool.query(
            `
            INSERT INTO users
            (id, username, password)
            VALUES ($1, $2, $3)
            `,
            [
                newUserId,
                username,
                hashedPassword
            ]
        );

        console.log(
            "USER REGISTER:",
            username
        );

        res.redirect("/login");

    } catch (error) {

        console.error(
            "REGISTER ERROR:",
            error
        );

        res.status(500).send(
            "Gagal melakukan registrasi."
        );
    }
});

// =====================================================
// DATABASE TEST
// =====================================================

app.get("/db-test", async (req, res) => {

    try {

        const result =
            await pool.query(
                "SELECT NOW() AS waktu"
            );

        res.send(
            "DATABASE OK - " +
            result.rows[0].waktu
        );

    } catch (error) {

        console.error(
            "DB TEST ERROR:",
            error
        );

        res.status(500).send(
            "DATABASE ERROR"
        );
    }
});

// =====================================================
// START SERVER
// =====================================================

async function startServer() {

    await initDatabase();

    app.listen(
        PORT,
        "0.0.0.0",
        () => {

            console.log(
                `Forum berjalan di port ${PORT}`
            );
        }
    );
}

startServer();