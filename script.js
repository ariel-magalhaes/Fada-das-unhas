import { db } from "./firebase.js";
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  where
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

flatpickr("#data", {
  dateFormat: "Y-m-d",
  minDate: "today",

  disable: [
    function(date) {
      // 0 = domingo, 6 = sábado
      return (date.getDay() === 0 || date.getDay() === 6);
    }
  ],

  locale: {
    firstDayOfWeek: 1
  }
});
const form = document.getElementById("agendamentoForm");

const campoNome = document.getElementById("nome");
const campoEmail = document.getElementById("email");
const campoData = document.getElementById("data");
const campoHorario = document.getElementById("horario");
const campoServico = document.getElementById("servico");
const campoObservacao = document.getElementById("observacao");

const erroNome = document.getElementById("erroNome");
const erroEmail = document.getElementById("erroEmail");
const erroData = document.getElementById("erroData");
const erroHorario = document.getElementById("erroHorario");
const erroServico = document.getElementById("erroServico");

const hoje = new Date().toISOString().split("T")[0];
campoData.min = hoje;

let unsubscribeHorarios = null;
let horariosOcupados = [];

function mostrarErro(campo, elementoErro, mensagem) {
  campo.classList.add("input-error");
  elementoErro.textContent = mensagem;
}

function limparErro(campo, elementoErro) {
  campo.classList.remove("input-error");
  elementoErro.textContent = "";
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function gerarIdAgendamento(data, horario) {
  return `${data}_${horario.replace(":", "-")}`;
}

function atualizarSelectHorarios() {
  Array.from(campoHorario.options).forEach((option) => {
    if (!option.value) {
      option.disabled = false;
      option.textContent = "Selecione";
      return;
    }

    const ocupado = horariosOcupados.includes(option.value);
    option.disabled = ocupado;
    option.textContent = ocupado
      ? `${option.value} — Indisponível`
      : option.value;
  });

  if (campoHorario.value && horariosOcupados.includes(campoHorario.value)) {
    campoHorario.value = "";
  }
}

function ouvirHorariosDaData(dataSelecionada) {
  if (unsubscribeHorarios) {
    unsubscribeHorarios();
    unsubscribeHorarios = null;
  }

  if (!dataSelecionada) {
    horariosOcupados = [];
    atualizarSelectHorarios();
    return;
  }

  const q = query(
    collection(db, "agendamentos"),
    where("dataOriginal", "==", dataSelecionada)
  );

  unsubscribeHorarios = onSnapshot(
    q,
    (snapshot) => {
      horariosOcupados = snapshot.docs.map((item) => item.data().horario);
      atualizarSelectHorarios();
    },
    (error) => {
      console.error("Erro ao carregar horários:", error);
      mostrarErro(campoHorario, erroHorario, "Não foi possível carregar os horários.");
    }
  );
}

function limparTodosErros() {
  limparErro(campoNome, erroNome);
  limparErro(campoEmail, erroEmail);
  limparErro(campoData, erroData);
  limparErro(campoHorario, erroHorario);
  limparErro(campoServico, erroServico);
}

[campoNome, campoEmail, campoData, campoHorario, campoServico].forEach((campo) => {
  campo.addEventListener("input", () => {
    if (campo === campoNome) limparErro(campoNome, erroNome);
    if (campo === campoEmail) limparErro(campoEmail, erroEmail);
    if (campo === campoData) limparErro(campoData, erroData);
    if (campo === campoHorario) limparErro(campoHorario, erroHorario);
    if (campo === campoServico) limparErro(campoServico, erroServico);
  });

  campo.addEventListener("change", () => {
    if (campo === campoNome) limparErro(campoNome, erroNome);
    if (campo === campoEmail) limparErro(campoEmail, erroEmail);
    if (campo === campoData) limparErro(campoData, erroData);
    if (campo === campoHorario) limparErro(campoHorario, erroHorario);
    if (campo === campoServico) limparErro(campoServico, erroServico);
  });
});

campoData.addEventListener("change", () => {
  limparErro(campoData, erroData);
  limparErro(campoHorario, erroHorario);
  ouvirHorariosDaData(campoData.value);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const nome = campoNome.value.trim();
  const email = campoEmail.value.trim();
  const data = campoData.value;
  const horario = campoHorario.value;
  const servico = campoServico.value;
  const observacao = campoObservacao.value.trim();

  let formularioValido = true;

  limparTodosErros();

  if (!nome) {
    mostrarErro(campoNome, erroNome, "Digite seu nome.");
    formularioValido = false;
  }

  if (!email) {
    mostrarErro(campoEmail, erroEmail, "Digite seu e-mail.");
    formularioValido = false;
  } else if (!validarEmail(email)) {
    mostrarErro(campoEmail, erroEmail, "Digite um e-mail válido.");
    formularioValido = false;
  }

  if (!data) {
    mostrarErro(campoData, erroData, "Selecione uma data.");
    formularioValido = false;
  }

  if (!horario) {
    mostrarErro(campoHorario, erroHorario, "Escolha um horário.");
    formularioValido = false;
  }

  if (!servico) {
    mostrarErro(campoServico, erroServico, "Selecione um serviço.");
    formularioValido = false;
  }

  if (!formularioValido) return;

  const dataFormatada = new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
  const idAgendamento = gerarIdAgendamento(data, horario);
  const refAgendamento = doc(db, "agendamentos", idAgendamento);

 const novoAgendamento = {
  id: idAgendamento,
  nome,
  email,
  data: dataFormatada,
  dataOriginal: data,
  horario,
  servico,
  observacao: observacao || "Nenhuma",
  status: "pendente",
  criadoEm: new Date().toISOString()
};

  try {
    await runTransaction(db, async (transaction) => {
      const agendamentoExistente = await transaction.get(refAgendamento);

      if (agendamentoExistente.exists()) {
        throw new Error("HORARIO_OCUPADO");
      }

      transaction.set(refAgendamento, novoAgendamento);
    });

    localStorage.setItem("agendamento", JSON.stringify(novoAgendamento));
    window.location.href = "confirmacao.html";
  } catch (error) {
    console.error("Erro ao salvar agendamento:", error);

    if (error.message === "HORARIO_OCUPADO") {
      mostrarErro(campoHorario, erroHorario, "Esse horário já foi reservado para esta data.");
      ouvirHorariosDaData(data);
    } else {
      mostrarErro(campoHorario, erroHorario, "Não foi possível concluir o agendamento agora.");
    }
  }
});

if (campoData.value) {
  ouvirHorariosDaData(campoData.value);
} else {
  atualizarSelectHorarios();
}