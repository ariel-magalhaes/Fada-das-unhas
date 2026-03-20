import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  addDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const loginCard = document.getElementById("loginCard");
const painelCard = document.getElementById("painelCard");
const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");

const adminEmail = document.getElementById("adminEmail");
const adminSenha = document.getElementById("adminSenha");
const loginErro = document.getElementById("loginErro");

const filtroData = document.getElementById("filtroData");
const filtroStatus = document.getElementById("filtroStatus");
const listaAgendamentos = document.getElementById("listaAgendamentos");

const totalAgendamentos = document.getElementById("totalAgendamentos");
const totalPendentes = document.getElementById("totalPendentes");
const totalConfirmados = document.getElementById("totalConfirmados");
const totalCancelados = document.getElementById("totalCancelados");

let unsubscribeLista = null;
let agendamentosCache = [];

const hoje = new Date().toISOString().split("T")[0];
filtroData.value = hoje;

btnLogin.addEventListener("click", async () => {
  loginErro.textContent = "";

  try {
    await signInWithEmailAndPassword(
      auth,
      adminEmail.value.trim(),
      adminSenha.value.trim()
    );
  } catch (error) {
    console.error("Erro no login:", error);
    loginErro.textContent = "Não foi possível entrar. Verifique e-mail e senha.";
  }
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginCard.classList.add("hidden");
    painelCard.classList.remove("hidden");
    btnLogout.classList.remove("hidden");
    carregarAgendamentos();
  } else {
    loginCard.classList.remove("hidden");
    painelCard.classList.add("hidden");
    btnLogout.classList.add("hidden");

    if (unsubscribeLista) {
      unsubscribeLista();
      unsubscribeLista = null;
    }
  }
});

filtroData.addEventListener("change", carregarAgendamentos);
filtroStatus.addEventListener("change", carregarAgendamentos);

function badgeStatus(status) {
  if (status === "confirmado") {
    return '<span class="badge badge-confirmado">Confirmado</span>';
  }
  if (status === "cancelado") {
    return '<span class="badge badge-cancelado">Cancelado</span>';
  }
  return '<span class="badge badge-pendente">Pendente</span>';
}

function atualizarResumo(lista) {
  totalAgendamentos.textContent = String(lista.length);
  totalPendentes.textContent = String(
    lista.filter((item) => item.status === "pendente").length
  );
  totalConfirmados.textContent = String(
    lista.filter((item) => item.status === "confirmado").length
  );
  totalCancelados.textContent = String(
    lista.filter((item) => item.status === "cancelado").length
  );
}

function renderizarLista(lista) {
  atualizarResumo(lista);

  if (!lista.length) {
    listaAgendamentos.innerHTML =
      '<div class="empty">Nenhum agendamento encontrado para esse filtro.</div>';
    return;
  }

  listaAgendamentos.innerHTML = lista
    .map(
      (item) => `
      <article class="agendamento-card">
        <div class="agendamento-topo">
          <div>
            <h3>${item.nome || "Sem nome"}</h3>
            <p>${item.data || "-"} às ${item.horario || "-"}</p>
          </div>
          ${badgeStatus(item.status)}
        </div>

        <div class="info-grid">
          <p><strong>E-mail:</strong> ${item.email || "-"}</p>
          <p><strong>Serviço:</strong> ${item.servico || "-"}</p>
          <p><strong>Observação:</strong> ${item.observacao || "Nenhuma"}</p>
          <p><strong>ID:</strong> ${item.id}</p>
        </div>

        <div class="acoes">
          <button class="action-btn btn-confirmar" data-id="${item.id}" data-status="confirmado">Confirmar</button>
          <button class="action-btn btn-cancelar" data-id="${item.id}" data-status="cancelado">Cancelar</button>
          <button class="action-btn btn-pendente" data-id="${item.id}" data-status="pendente">Voltar para pendente</button>
        </div>
      </article>
    `
    )
    .join("");

  document.querySelectorAll(".action-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const status = btn.dataset.status;
      await atualizarStatus(id, status);
    });
  });
}

async function enviarEmailStatus(agendamento, novoStatus) {
  if (novoStatus === "pendente") {
    return;
  }

  let assunto = "";
  let titulo = "";
  let mensagem = "";

  if (novoStatus === "confirmado") {
    assunto = "Seu agendamento foi confirmado 💅";
    titulo = "Agendamento confirmado";
    mensagem = `Olá, ${agendamento.nome}! Seu agendamento foi confirmado para ${agendamento.data} às ${agendamento.horario}. Serviço: ${agendamento.servico}.`;
  } else if (novoStatus === "cancelado") {
    assunto = "Seu agendamento foi cancelado";
    titulo = "Agendamento cancelado";
    mensagem = `Olá, ${agendamento.nome}. Seu agendamento de ${agendamento.data} às ${agendamento.horario} foi cancelado.`;
  }

  try {
    await addDoc(collection(db, "mail"), {
      to: [agendamento.email],
      message: {
        subject: assunto,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2>${titulo}</h2>
            <p>${mensagem}</p>
            <p><strong>Data:</strong> ${agendamento.data}</p>
            <p><strong>Horário:</strong> ${agendamento.horario}</p>
            <p><strong>Serviço:</strong> ${agendamento.servico}</p>
            <p>Fada das Unhas Esmalteria</p>
          </div>
        `
      }
    });
  } catch (error) {
    console.error("Erro ao criar documento de e-mail:", error);
  }
}

async function atualizarStatus(id, novoStatus) {
  try {
    const card = document
      .querySelector(`[data-id="${id}"]`)
      ?.closest(".agendamento-card");

    const nome = card?.querySelector("h3")?.textContent || "";
    const itemAtual = agendamentosCache.find((item) => item.id === id);

    if (!itemAtual) return;

    await updateDoc(doc(db, "agendamentos", id), {
      status: novoStatus
    });

    await enviarEmailStatus(itemAtual, novoStatus);

    if (novoStatus === "confirmado") {
      alert(`Agendamento de ${nome} confirmado com sucesso.`);
    } else if (novoStatus === "cancelado") {
      alert(`Agendamento de ${nome} cancelado com sucesso.`);
    }
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    alert("Não foi possível atualizar o status agora.");
  }
}

function carregarAgendamentos() {
  if (unsubscribeLista) {
    unsubscribeLista();
    unsubscribeLista = null;
  }

  const dataSelecionada = filtroData.value;
  const statusSelecionado = filtroStatus.value;

  unsubscribeLista = onSnapshot(
    collection(db, "agendamentos"),
    (snapshot) => {
      let lista = snapshot.docs.map((docItem) => ({
        id: docItem.id,
        ...docItem.data()
      }));

      if (dataSelecionada) {
        lista = lista.filter((item) => item.dataOriginal === dataSelecionada);
      }

      if (statusSelecionado) {
        lista = lista.filter((item) => item.status === statusSelecionado);
      }

      lista.sort((a, b) => {
        const horarioA = a.horario || "";
        const horarioB = b.horario || "";
        return horarioA.localeCompare(horarioB);
      });

      agendamentosCache = lista;
      renderizarLista(lista);
    },
    (error) => {
      console.error("Erro ao carregar agendamentos:", error);
      listaAgendamentos.innerHTML =
        '<div class="empty">Erro ao carregar agendamentos. Veja o console.</div>';
    }
  );
}