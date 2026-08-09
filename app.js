const express = require("express");
const fs = require("fs");
const path = require("path");
const session = require("express-session");

const app = express();

const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, "threads.json");
const USERS_FILE = path.join(__dirname, "users.json");

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        secret: "world-football-forum-secret",
        resave: false,
        saveUninitialized: false
    })
);

app.use(express.static("public"));

app.set("view engine", "ejs");

// =====================================================
// THREAD DATA
// =====================================================

let threads = [];

if (fs.existsSync(DATA_FILE)) {
    try {
        threads = JSON.parse(
            fs.readFileSync(DATA_FILE, "utf8")
        );

        if (!Array.isArray(threads)) {
            threads = [];
        }

    } catch (error) {
        console.log("Gagal membaca threads.json:", error);
        threads = [];
    }
}

// =====================================================
// NORMALISASI DATA THREAD LAMA
// =====================================================

threads = threads.map(thread => {

    return {
        ...thread,

        id: thread.id || Date.now(),

        title: thread.title || "Tanpa judul",

        content: thread.content || "",

        category: thread.category || "berita",

        author: thread.author || "Unknown",

        date: thread.date || new Date().toLocaleDateString(),

        views: Number(thread.views) || 0,

        comments: Array.isArray(thread.comments)
            ? thread.comments
            : []
    };

});

function saveThreads() {

    fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(threads, null, 2)
    );

}

// =====================================================
// USER DATA
// =====================================================

let users = [];

if (fs.existsSync(USERS_FILE)) {

    try {

        users = JSON.parse(
            fs.readFileSync(USERS_FILE, "utf8")
        );

        if (!Array.isArray(users)) {
            users = [];
        }

    } catch (error) {

        console.log("Gagal membaca users.json:", error);

        users = [];
    }
}

function saveUsers() {

    fs.writeFileSync(
        USERS_FILE,
        JSON.stringify(users, null, 2)
    );

}

// =====================================================
// KATEGORI YANG DIIZINKAN
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
// HOME
// =====================================================

app.get("/", (req, res) => {

    console.log(
        "HOME SESSION:",
        req.session.username
    );

    const latestThreads = [...threads]
        .sort((a, b) => b.id - a.id)
        .slice(0, 10);

    res.render("index", {

        user: req.session.username,

        threads: latestThreads

    });

});

// =====================================================
// CATEGORY
// =====================================================

app.get("/category/:name", (req, res) => {

    const categoryName =
        req.params.name.toLowerCase();

    // Cek apakah kategori valid
    if (!VALID_CATEGORIES.includes(categoryName)) {

        return res.status(404).send(
            "Kategori tidak ditemukan."
        );

    }

    const filteredThreads = threads
        .filter(thread =>
            String(thread.category).toLowerCase()
            === categoryName
        )
        .sort((a, b) => b.id - a.id);

    res.render("category", {

        category: categoryName,

        threads: filteredThreads,

        user: req.session.username

    });

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
// CREATE THREAD - SAVE
// =====================================================

app.post("/create", (req, res) => {

    if (!req.session.username) {

        return res.redirect("/login");

    }

    console.log(
        "DATA CREATE:",
        req.body
    );

    const title =
        String(req.body.title || "").trim();

    const content =
        String(req.body.content || "").trim();

    const category =
        String(req.body.category || "")
            .trim()
            .toLowerCase();

    // Validasi judul
    if (!title) {

        return res.send(
            "Judul thread wajib diisi."
        );

    }

    // Validasi isi
    if (!content) {

        return res.send(
            "Isi thread wajib diisi."
        );

    }

    // Validasi kategori
    if (!VALID_CATEGORIES.includes(category)) {

        return res.send(
            "Kategori tidak valid."
        );

    }

    const newThread = {

        id: Date.now(),

        title: title,

        content: content,

        category: category,

        author: req.session.username,

        date: new Date().toLocaleDateString(),

        views: 0,

        comments: []

    };

    threads.push(newThread);

    saveThreads();

    res.redirect(
        "/thread/" + newThread.id
    );

});

// =====================================================
// DELETE THREAD
// =====================================================

app.post("/thread/:id/delete", (req, res) => {

    if (!req.session.username) {

        return res.redirect("/login");

    }

    const threadIndex = threads.findIndex(
        thread =>
            thread.id == req.params.id
    );

    if (threadIndex === -1) {

        return res.send(
            "Thread tidak ditemukan."
        );

    }

    const thread =
        threads[threadIndex];

    // Hanya pemilik thread
    // yang boleh menghapus
    if (
        thread.author !==
        req.session.username
    ) {

        return res.status(403).send(
            "Kamu tidak boleh menghapus thread ini."
        );

    }

    threads.splice(threadIndex, 1);

    saveThreads();

    res.redirect("/");

});

// =====================================================
// THREAD DETAIL
// =====================================================

app.get("/thread/:id", (req, res) => {

    const thread = threads.find(
        thread =>
            thread.id == req.params.id
    );

    if (!thread) {

        return res.send(
            "Thread tidak ditemukan."
        );

    }

    // Pastikan data lama aman
    if (!Array.isArray(thread.comments)) {

        thread.comments = [];

    }

    if (!thread.views) {

        thread.views = 0;

    }

    // Tambah jumlah views
    thread.views++;

    saveThreads();

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

});

// =====================================================
// ADD COMMENT
// =====================================================

app.post("/thread/:id/comment", (req, res) => {

    if (!req.session.username) {

        return res.redirect("/login");

    }

    const thread = threads.find(
        thread =>
            thread.id == req.params.id
    );

    if (!thread) {

        return res.send(
            "Thread tidak ditemukan."
        );

    }

    if (!Array.isArray(thread.comments)) {

        thread.comments = [];

    }

    const commentText =
        String(req.body.comment || "").trim();

    if (!commentText) {

        return res.send(
            "Komentar tidak boleh kosong."
        );

    }

    const newComment = {

        author: req.session.username,

        text: commentText,

        date: new Date().toLocaleDateString()

    };

    thread.comments.push(newComment);

    saveThreads();

    res.redirect(
        "/thread/" + thread.id
    );

});

// =====================================================
// DELETE COMMENT
// =====================================================

app.post(
    "/thread/:id/comment/delete/:commentIndex",
    (req, res) => {

        if (!req.session.username) {

            return res.redirect("/login");

        }

        const thread = threads.find(
            thread =>
                thread.id == req.params.id
        );

        if (!thread) {

            return res.send(
                "Thread tidak ditemukan."
            );

        }

        if (!Array.isArray(thread.comments)) {

            thread.comments = [];

        }

        const commentIndex =
            parseInt(
                req.params.commentIndex
            );

        if (

            isNaN(commentIndex) ||

            commentIndex < 0 ||

            commentIndex >=
            thread.comments.length

        ) {

            return res.send(
                "Komentar tidak ditemukan."
            );

        }

        const comment =
            thread.comments[commentIndex];

        // Hanya pemilik komentar
        // yang boleh menghapus
        if (
            comment.author !==
            req.session.username
        ) {

            return res.status(403).send(
                "Kamu tidak boleh menghapus komentar ini."
            );

        }

        thread.comments.splice(
            commentIndex,
            1
        );

        saveThreads();

        res.redirect(
            "/thread/" + thread.id
        );

    }
);

// =====================================================
// LOGIN - FORM
// =====================================================

app.get("/login", (req, res) => {

    res.render("login");

});

// =====================================================
// LOGIN
// =====================================================

app.post("/login", (req, res) => {

    const username =
        String(req.body.username || "").trim();

    const password =
        String(req.body.password || "");

    const user = users.find(
        user =>
            user.username === username &&
            user.password === password
    );

    if (!user) {

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

            console.log(
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
            "SESSION ID:",
            req.sessionID
        );

        res.redirect("/");

    });

});

// =====================================================
// LOGOUT
// =====================================================

app.get("/logout", (req, res) => {

    req.session.destroy((err) => {

        if (err) {

            console.log(
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

app.post("/register", (req, res) => {

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

    const existingUser = users.find(
        user =>
            user.username === username
    );

    if (existingUser) {

        return res.send(
            "Username sudah digunakan."
        );

    }

    const newUser = {

        id: Date.now(),

        username: username,

        password: password

    };

    users.push(newUser);

    saveUsers();

    res.redirect("/login");

});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, "0.0.0.0", () => {

    console.log(
        `Forum berjalan di port ${PORT}`
    );

});