import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec, run, notify, theme, focused, props, openOverlay, window } from "herdr";

const FIELDS = ["ID", "Names", "State", "Status", "Ports", 'Label "com.docker.compose.project"', 'Label "com.docker.compose.service"', 'Label "com.docker.compose.project.working_dir"'];
const FORMAT = FIELDS.map(f => `{{.${f}}}`).join("\t");

/**
 * @typedef {{ id: string, name: string, state: string, status: string, health: "healthy" | "unhealthy" | "starting" | null, ports: number[] }} Container
 * @typedef {{ project: string | null, folder: string | null, containers: Container[] }} Group
 */

function parsePorts(text) {
  return [...new Set([...text.matchAll(/:(\d+)->/g)].map(m => Number(m[1])))];
}

function parseHealth(status) {
  return status.match(/\((healthy|unhealthy)\)/)?.[1] ?? (status.includes("health: starting") ? "starting" : null);
}

/** @returns {Promise<{ groups: Group[] } | { error: string }>} */
async function load() {
  try {
    const out = await exec("docker", ["ps", "-a", "--format", FORMAT], { timeout: 10000 });
    if (out.code !== 0) return { error: out.stderr.trim().split("\n")[0] || "docker ps a échoué" };
    const byProject = new Map();
    for (const line of out.stdout.split("\n").filter(Boolean)) {
      const [id, names, state, status, ports, project, service, folder] = line.split("\t");
      const key = project || null;
      if (!byProject.has(key)) byProject.set(key, { project: key, folder: folder || null, containers: [] });
      byProject.get(key).containers.push({ id, name: service || names, state, status, health: parseHealth(status), ports: parsePorts(ports) });
    }
    return { groups: [...byProject.values()] };
  } catch (e) {
    return { error: String(e?.message ?? e) };
  }
}

function tone(t, c) {
  if (c.state !== "running") return t.dim;
  if (c.health === "unhealthy") return t.blocked;
  if (c.health === "starting") return t.working;
  return t.ansi2;
}

function isCurrent(group) {
  const cwd = focused()?.cwd;
  return Boolean(group.folder && cwd && (cwd === group.folder || cwd.startsWith(`${group.folder}/`) || group.folder.startsWith(`${cwd}/`)));
}

export default class Docker extends View {
  init(_props, cx) {
    this.popup = Boolean(props()?.overlay);
    this.data = null;
    this.showStopped = false;
    this.refresh(cx);
    cx.timer.every(this.popup ? 3000 : 5000, cx => this.refresh(cx));
  }

  async refresh(cx) {
    this.data = await load();
    cx.notify();
  }

  render() {
    return this.popup ? this.renderList() : this.renderBadge();
  }

  renderBadge() {
    const t = theme();
    const all = this.data?.groups?.flatMap(g => g.containers) ?? [];
    const running = all.filter(c => c.state === "running").length;
    const unhealthy = all.some(c => c.health === "unhealthy");
    const color = this.data?.error ? t.dim : unhealthy ? t.blocked : running ? t.foreground : t.muted;
    return h_flex().id("docker-badge").size_full().px(12).gap(6).items_center().justify_end().cursor_pointer()
      .bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(color).hover(s => s.bg(t.hover))
      .on_click(() => openOverlay({ mod: "docker", kind: "popup", width: 460, height: 520 }))
      .child(svg("mods/docker/container.svg").size(13).text_color(color))
      .child(this.data?.error ? "!" : String(running));
  }

  renderList() {
    const t = theme();
    const header = h_flex().px(12).py(8).gap(8).items_center().border_b(1).border_color(t.border)
      .child(svg("mods/docker/container.svg").size(14).text_color(t.muted))
      .child(div().flex_1().text_size(13).text_color(t.foreground).child("Conteneurs Docker"))
      .child(div().id("toggle-stopped").cursor_pointer().text_size(11.5).text_color(this.showStopped ? t.accent : t.dim)
        .on_click((_e, cx) => { this.showStopped = !this.showStopped; cx.notify(); })
        .child(this.showStopped ? "Masquer arrêtés" : "Afficher arrêtés"));

    const body = v_flex().id("docker-list").flex_1().overflow_y_scroll().pb(8);
    if (!this.data) return v_flex().size_full().child(header).child(body.p(12).text_color(t.dim).child("Chargement…"));
    if (this.data.error) return v_flex().size_full().child(header).child(body.p(12).text_color(t.blocked).child(this.data.error));

    const groups = this.data.groups
      .map(g => ({ ...g, current: isCurrent(g), containers: g.containers.filter(c => this.showStopped || c.state === "running") }))
      .filter(g => g.containers.length)
      .sort((a, b) => Number(b.current) - Number(a.current) || Number(a.project === null) - Number(b.project === null) || (a.project ?? "").localeCompare(b.project ?? ""));

    if (!groups.length) return v_flex().size_full().child(header).child(body.p(12).text_color(t.dim).child("Aucun conteneur actif."));
    return v_flex().size_full().child(header).child(body.children(groups.map(g => this.renderGroup(t, g))));
  }

  renderGroup(t, group) {
    return v_flex().pt(8)
      .child(h_flex().px(12).pb(4).gap(6).items_center().text_size(11).text_color(group.current ? t.accent : t.muted)
        .child(div().truncate().child(group.project ?? "Sans projet Compose"))
        .when(group.current, el => el.child(div().text_color(t.dim).child("· espace actif"))))
      .children(group.containers.map(c => this.renderContainer(t, c)));
  }

  renderContainer(t, c) {
    const running = c.state === "running";
    const action = (id, label, onClick) => div().id(`${id}-${c.id}`).px(6).py(1).rounded(4).cursor_pointer()
      .text_size(11).text_color(t.dim).hover(s => s.bg(t.raised).text_color(t.foreground)).on_click(onClick).child(label);
    return h_flex().id(`row-${c.id}`).px(12).py(4).gap(8).items_center().hover(s => s.bg(t.hover))
      .child(div().size(7).rounded(4).flex_none().bg(tone(t, c)))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().text_size(12.5).text_color(running ? t.foreground : t.muted).child(c.name))
        .child(h_flex().gap(6).text_size(10.5).text_color(t.dim)
          .child(div().truncate().child(c.status))
          .children(c.ports.map(port => div().id(`port-${c.id}-${port}`).cursor_pointer().text_color(t.accent)
            .on_click(() => this.openPort(port)).child(`:${port}`)))))
      .child(action("logs", "logs", () => this.openTerminal(`logs ${c.name}`, ["docker", "logs", "-f", "--tail", "200", c.id])))
      .when(running, el => el.child(action("shell", "shell", () => this.openTerminal(c.name, ["docker", "exec", "-it", c.id, "sh", "-c", "command -v bash >/dev/null && exec bash || exec sh"]))))
      .child(action("restart", running ? "redémarrer" : "démarrer", (_e, cx) => this.dockerCommand(cx, running ? "restart" : "start", c)));
  }

  openTerminal(name, argv) {
    run("terminal.open", { argv, name, place: "tab" });
  }

  openPort(port) {
    exec(window()?.platform === "macos" ? "open" : "xdg-open", [`http://localhost:${port}`]);
  }

  dockerCommand(cx, verb, c) {
    cx.spawn(async cx => {
      const out = await exec("docker", [verb, c.id], { timeout: 60000 }).catch(e => ({ code: 1, stderr: String(e) }));
      if (out.code !== 0) notify({ title: `docker ${verb} ${c.name}`, body: out.stderr.trim(), level: "error" });
      await this.refresh(cx);
    });
  }
}
