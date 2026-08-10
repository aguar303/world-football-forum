document.addEventListener("DOMContentLoaded", () => {

    const animationLayer = document.createElement("div");

    animationLayer.id = "forum-animation-layer";

    document.body.prepend(animationLayer);

    const ball = document.createElement("div");

    ball.className = "floating-football";
    ball.innerHTML = "⚽";

    animationLayer.appendChild(ball);

    const particleContainer = document.createElement("div");

    particleContainer.className = "particle-container";

    animationLayer.appendChild(particleContainer);


    const particleCount =
        window.innerWidth < 768 ? 18 : 35;


    for (let i = 0; i < particleCount; i++) {

        const particle = document.createElement("span");

        particle.className = "forum-particle";

        particle.style.left =
            Math.random() * 100 + "%";

        particle.style.top =
            Math.random() * 100 + "%";

        particle.style.animationDelay =
            Math.random() * 6 + "s";

        particle.style.animationDuration =
            5 + Math.random() * 7 + "s";

        particleContainer.appendChild(particle);
    }

    const rainContainer = document.createElement("div");

    rainContainer.className = "rain-container";

    animationLayer.appendChild(rainContainer);


    const rainCount =
        window.innerWidth < 768 ? 25 : 50;


    for (let i = 0; i < rainCount; i++) {

        const drop = document.createElement("span");

        drop.className = "rain-drop";

        drop.style.left =
            Math.random() * 100 + "%";

        drop.style.animationDelay =
            Math.random() * 2 + "s";

        drop.style.animationDuration =
            0.8 + Math.random() * 0.8 + "s";

        rainContainer.appendChild(drop);
    }

    const fireworksContainer =
        document.createElement("div");

    fireworksContainer.className =
        "fireworks-container";

    animationLayer.appendChild(
        fireworksContainer
    );


    function createFirework() {

        const firework =
            document.createElement("div");

        firework.className =
            "firework";

        firework.style.left =
            10 + Math.random() * 80 + "%";

        firework.style.top =
            20 + Math.random() * 45 + "%";

        fireworksContainer.appendChild(
            firework
        );


        setTimeout(() => {

            firework.remove();

        }, 1800);
    }


    setTimeout(() => {

        createFirework();

    }, 500);


    setTimeout(() => {

        createFirework();

    }, 1100);


    setTimeout(() => {

        createFirework();

    }, 1700);

    const loader =
        document.createElement("div");

    loader.id = "page-loader";

    loader.innerHTML = `
        <div class="loader-content">

            <div class="loader-ball">
                ⚽
            </div>

            <div class="loader-title">
                FORUM SAHABAT BOLA
            </div>

            <div class="loader-text">
                Memuat...
            </div>

        </div>
    `;

    document.body.appendChild(loader);

    setTimeout(() => {

        loader.classList.add(
            "loader-hidden"
        );

    }, 400);

    document.addEventListener(
        "click",
        (event) => {

            const link =
                event.target.closest("a");

            if (!link) {
                return;
            }


            const href =
                link.getAttribute("href");


            if (!href) {
                return;
            }


            if (
                href.startsWith("#") ||
                href.startsWith("javascript:")
            ) {
                return;
            }


            if (
                link.target === "_blank" ||
                event.ctrlKey ||
                event.shiftKey ||
                event.metaKey
            ) {
                return;
            }


            const currentHost =
                window.location.host;


            try {

                const targetURL =
                    new URL(
                        link.href,
                        window.location.href
                    );


                if (
                    targetURL.host !==
                    currentHost
                ) {
                    return;
                }

            } catch (error) {

                return;

            }


            event.preventDefault();


            loader.classList.remove(
                "loader-hidden"
            );


            setTimeout(() => {

                window.location.href =
                    link.href;

            }, 350);

        }
    );

});