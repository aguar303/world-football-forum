const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3000;

// =====================================================
// DATABASE
// =====================================================

if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL belum diatur.");
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
// DATABASE SETUP
// =====================================================

async function initDatabase() {

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id BIGINT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS threads (
            id BIGINT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT NOT NULL,
            author TEXT NOT NULL,
            date TEXT NOT NULL,
            views INTEGER DEFAULT 0,
            comments JSONB DEFAULT '[]'::jsonb
        );
    `);

    console.log("Database WFF siap.");

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
            SELECT *
            FROM threads
            ORDER BY id DESC
            LIMIT 10
        `);

        res.render("index", {

            user: req.session.username,

            threads: result.rows

        });

    } catch (error) {

        console.error("HOME ERROR:", error);

        res.status(500).send(
            "Terjadi kesalahan database."
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
            SELECT *
            FROM threads
            WHERE LOWER(category) = $1
            ORDER BY id DESC
            `,
            [categoryName]
        );

        res.render("category", {

            category: categoryName,

            threads: result.rows,

            user: req.session.username

        });

    } catch (error) {

        console.error("CATEGORY ERROR:", error);

        res.status(500).send(
            "Terjadi kesalahan database."
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

        const id = Date.now();

        const date =
            new Date().toLocaleDateString("id-ID");

        await pool.query(
            `
            INSERT INTO threads
            (
                id,
                title,
                content,
                category,
                author,
                date,
                views,
                comments
            )
            VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8)
            `,
            [
                id,
                title,
                content,
                category,
                req.session.username,
                date,
                0,
                JSON.stringify([])
            ]
        );

        res.redirect("/thread/" + id);

    } catch (error) {

        console.error("CREATE THREAD ERROR:", error);

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

        const result = await pool.query(
            `
            SELECT *
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

        const thread = result.rows[0];

        const newViews =
            Number(thread.views || 0) + 1;

        await pool.query(
            `
            UPDATE threads
            SET views = $1
            WHERE id = $2
            `,
            [newViews, thread.id]
        );

        thread.views = newViews;

        thread.comments =
            Array.isArray(thread.comments)
                ? thread.comments
                : [];

        res.render("thread", {

            id: thread.id,

            title: thread.title,

            content: thread.content,

            category: thread.category,

            author: thread.author,

            date: thread.date,

            views: thread.views,

            comments: thread.comments,

            user: req.session.username

        });

    } catch (error) {

        console.error("THREAD ERROR:", error);

        res.status(500).send(
            "Terjadi kesalahan database."
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

        const result = await pool.query(
            `
            SELECT *
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

        const thread = result.rows[0];

        let comments =
            Array.isArray(thread.comments)
                ? thread.comments
                : [];

        const commentText =
            String(req.body.comment || "").trim();

        if (!commentText) {

            return res.send(
                "Komentar tidak boleh kosong."
            );

        }

        comments.push({

            author: req.session.username,

            text: commentText,

            date:
                new Date().toLocaleDateString("id-ID")

        });

        await pool.query(
            `
            UPDATE threads
            SET comments = $1
            WHERE id = $2
            `,
            [
                JSON.stringify(comments),
                thread.id
            ]
        );

        res.redirect(
            "/thread/" + thread.id
        );

    } catch (error) {

        console.error("COMMENT ERROR:", error);

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

            const result = await pool.query(
                `
                SELECT *
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

            const thread = result.rows[0];

            let comments =
                Array.isArray(thread.comments)
                    ? thread.comments
                    : [];

            const commentIndex =
                parseInt(
                    req.params.commentIndex
                );

            if (
                isNaN(commentIndex) ||
                commentIndex < 0 ||
                commentIndex >= comments.length
            ) {

                return res.send(
                    "Komentar tidak ditemukan."
                );

            }

            const comment =
                comments[commentIndex];

            if (
                comment.author !==
                req.session.username
            ) {

                return res.status(403).send(
                    "Kamu tidak boleh menghapus komentar ini."
                );

            }

            comments.splice(
                commentIndex,
                1
            );

            await pool.query(
                `
                UPDATE threads
                SET comments = $1
                WHERE id = $2
                `,
                [
                    JSON.stringify(comments),
                    thread.id
                ]
            );

            res.redirect(
                "/thread/" + thread.id
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

        const result = await pool.query(
            `
            SELECT *
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

        const thread = result.rows[0];

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
            [thread.id]
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
// LOGIN FORM
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

        const result = await pool.query(
            `
            SELECT *
            FROM users
            WHERE username = $1
              AND password = $2
            `,
            [
                username,
                password
            ]
        );

        if (result.rows.length === 0) {

            return res.send(
                "Username atau password salah."
            );

        }

        const user = result.rows[0];

        req.session.userId = user.id;

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

            res.redirect("/");

        });

    } catch (error) {

        console.error(
            "LOGIN ERROR:",
            error
        );

        res.status(500).send(
            "Terjadi kesalahan database."
        );

    }

});

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
// REGISTER FORM
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

        if (!password) {

            return res.send(
                "Password wajib diisi."
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

        const id = Date.now();

        await pool.query(
            `
            INSERT INTO users
            (
                id,
                username,
                password
            )
            VALUES
            ($1, $2, $3)
            `,
            [
                id,
                username,
                password
            ]
        );

        res.redirect("/login");

    } catch (error) {

        console.error(
            "REGISTER ERROR:",
            error
        );

        res.status(500).send(
            "Gagal membuat akun."
        );

    }

});

// =====================================================
// START SERVER
// =====================================================

async function startServer() {

    try {

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

    } catch (error) {

        console.error(
            "DATABASE CONNECTION ERROR:",
            error
        );

        process.exit(1);

    }

}

startServer();