// Light/Dark Mode Toggle
const themeToggle = document.getElementById("theme-toggle");
const body = document.body;

// Check if a mode is already set in local storage
if (localStorage.getItem("theme") === "light") {
    body.classList.add("light-mode");
}

// Toggle theme on button click
themeToggle.addEventListener("click", () => {
    body.classList.toggle("light-mode");
    
    // Save the theme preference
    if (body.classList.contains("light-mode")) {
        localStorage.setItem("theme", "light");
    } else {
        localStorage.setItem("theme", "dark");
    }
});

// Project Filtering System
const projects = [
    { name: "SWISS Crew Bot", category: "discord-bots", description: "Flight tracking system for Discord." },
    { name: "Modmail Bot", category: "discord-bots", description: "Ticket system with premium features." },
    { name: "Server Log System", category: "automation", description: "Roblox logging to Discord." },
    { name: "Stock Alert System", category: "stock-alerts", description: "SMS stock price notifications." }
];

const projectsContainer = document.querySelector(".projects-container");
const filterButtons = document.querySelectorAll(".filter-btn");

// Function to render projects
function renderProjects(filter) {
    projectsContainer.innerHTML = ""; // Clear previous projects

    projects.forEach(project => {
        if (filter === "all" || project.category === filter) {
            const projectCard = document.createElement("div");
            projectCard.classList.add("project-card");
            projectCard.innerHTML = `
                <h3>${project.name}</h3>
                <p>${project.description}</p>
            `;
            projectsContainer.appendChild(projectCard);
        }
    });
}

// Initial render
renderProjects("all");

// Filter functionality
filterButtons.forEach(button => {
    button.addEventListener("click", () => {
        document.querySelector(".filter-btn.active").classList.remove("active");
        button.classList.add("active");
        renderProjects(button.getAttribute("data-filter"));
    });
});