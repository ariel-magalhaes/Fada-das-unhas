import { db } from "./firebase.js";
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  where
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const servicos = {
  "Alongamento": { preco: 200, duracao: 120, intervalo: 30 },
  "Manutenção": { preco: 120, duracao: 90, intervalo: 30 },
  "Banho de gel": { preco: 160, duracao: 120, intervalo: 30 },
  "Blindagem": { preco: 120, duracao: 120, intervalo: 30 },
  "Reposição de unha": { preco: 15, duracao: 20, intervalo: 20 }
};

let datasBloqueadas = [];
let flatpickrData = null;

const form = document.getElementById("agendamentoForm");

const campoNome = document.getElementById("nome");
const campoEmail = document.getElementById("email");
const campoData = document.getElementById("data");
const campoHorario = document.getElementById("horario");
const campoServico = document.getElementById("servico");
const campoObservacao = document.getElementById("observacao");

const campoQuantidade = document.getElementById("campoQuantidade");
const inputQuantidade = document.getElementById("quantidade");

const erroNome = document.getElementById("erroNome");
const erroEmail = document.getElementById("erroEmail");
const erroData = document.getElementById("erroData");
const erroHorario = document.getElementById("erroHorario");
const erroServico = document.getElementById("erroServico");
const erroQuantidade = document.getElementById("erroQuantidade");

const hoje = new Date().toISOString().split("T")[0];
campoData.min = hoje;

let unsubscribeHorarios = null;
let agendamentosDoDia = [];

function configurarCalendario() {
  flatpickrData = flatpickr("#data", {
    dateFormat: "Y-m-d",
    altInput: true,
    altFormat: "d/m/Y",
    minDate: "today",
    disableMobile: true,
    locale: "pt",
    disable: [
      function (date) {
        const dataISO = formatarDataLocalParaISO(date);
        return (
          date.getDay() === 0 ||
          date.getDay() === 6 ||
          datasBloqueadas.includes(dataISO)
        );
      }
    ]
  });
}

function atualizarCalendarioComBloqueios() {
  if (!flatpickrData) return;

  flatpickrData.set("disable", [
    function (date) {
      const dataISO = formatarDataLocalParaISO(date);
      return (
        date.getDay() === 0 ||
        date.getDay() === 6 ||
        datasBloqueadas.includes(dataISO)
      );
    }
  ]);

  flatpickrData.redraw();

  if (campoData.value && datasBloqueadas.includes(campoData.value)) {
    campoData.value = "";
    campoHorario.innerHTML =
      '<option value="">Selecione uma nova data</option>';
    mostrarErro(
      campoData,
      erroData,
      "Essa data foi bloqueada pela administração."
    );
    agendamentosDoDia = [];
  }

  atualizarSelectHorarios();
}

function formatarDataLocalParaISO(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

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

function horarioParaMinutos(horario) {
  const [hora, minuto] = horario.split(":").map(Number);
  return hora * 60 + minuto;
}

function minutosParaHorario(totalMinutos) {
  const horas = String(Math.floor(totalMinutos / 60)).padStart(2, "0");
  const minutos = String(totalMinutos % 60).padStart(2, "0");
  return `${horas}:${minutos}`;
}

function intervalosDeTrabalho(dataSelecionada) {
  const diaSemana = new Date(`${dataSelecionada}T00:00:00`).getDay();

  const periodos = [
    { inicio: 9 * 60, fim: 11 * 60 },
    { inicio: 13 * 60, fim: 18 * 60 }
  ];

  if (diaSemana === 5) {
    periodos[1].fim = 16 * 60;
  }

  return periodos;
}

function horariosConflitam(inicioA, fimA, inicioB, fimB) {
  return inicioA < fimB && fimA > inicioB;
}

function obterQuantidadeReposicao() {
  const quantidade = Number(inputQuantidade.value);
  return Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 0;
}

function obterDuracaoServico(nomeServico) {
  if (nomeServico === "Reposição de unha") {
    const qtd = obterQuantidadeReposicao();
    return qtd * 20;
  }
  return servicos[nomeServico]?.duracao || 0;
}

function obterIntervaloServico(nomeServico) {
  if (nomeServico === "Reposição de unha") {
    return 20;
  }
  return servicos[nomeServico]?.intervalo || 30;
}

function horarioEstaDisponivel(horarioInicio, servicoSelecionado) {
  const inicioNovo = horarioParaMinutos(horarioInicio);
  const duracaoNovo = obterDuracaoServico(servicoSelecionado);
  const fimNovo = inicioNovo + duracaoNovo;

  return !agendamentosDoDia.some((agendamento) => {
    const inicioExistente = horarioParaMinutos(agendamento.horario);
    const duracaoExistente =
      Number(agendamento.duracao) || obterDuracaoServico(agendamento.servico);
    const fimExistente = inicioExistente + duracaoExistente;

    return horariosConflitam(
      inicioNovo,
      fimNovo,
      inicioExistente,
      fimExistente
    );
  });
}

function gerarHorariosDisponiveis(dataSelecionada, servicoSelecionado) {
  if (!dataSelecionada || !servicoSelecionado) return [];

  if (datasBloqueadas.includes(dataSelecionada)) {
    return [];
  }

  const duracaoServico = obterDuracaoServico(servicoSelecionado);
  const intervalo = obterIntervaloServico(servicoSelecionado);

  if (!duracaoServico) return [];

  const periodos = intervalosDeTrabalho(dataSelecionada);
  const horarios = [];

  periodos.forEach((periodo) => {
    for (
      let inicio = periodo.inicio;
      inicio + duracaoServico <= periodo.fim;
      inicio += intervalo
    ) {
      const horario = minutosParaHorario(inicio);

      if (horarioEstaDisponivel(horario, servicoSelecionado)) {
        horarios.push(horario);
      }
    }
  });

  return horarios;
}

function atualizarVisibilidadeQuantidade() {
  if (campoServico.value === "Reposição de unha") {
    campoQuantidade.classList.remove("hidden");
  } else {
    campoQuantidade.classList.add("hidden");
    inputQuantidade.value = "";
    limparErro(inputQuantidade, erroQuantidade);
  }
}

function atualizarSelectHorarios() {
  const dataSelecionada = campoData.value;
  const servicoSelecionado = campoServico.value;

  campoHorario.innerHTML = "";

  if (!servicoSelecionado) {
    campoHorario.innerHTML =
      '<option value="">Selecione um serviço primeiro</option>';
    campoHorario.value = "";
    return;
  }

  if (!dataSelecionada) {
    campoHorario.innerHTML =
      '<option value="">Selecione uma data primeiro</option>';
    campoHorario.value = "";
    return;
  }

  if (datasBloqueadas.includes(dataSelecionada)) {
    campoHorario.innerHTML =
      '<option value="">Dia indisponível para agendamento</option>';
    campoHorario.value = "";
    return;
  }

  if (
    servicoSelecionado === "Reposição de unha" &&
    !obterQuantidadeReposicao()
  ) {
    campoHorario.innerHTML =
      '<option value="">Informe a quantidade primeiro</option>';
    campoHorario.value = "";
    return;
  }

  const horariosDisponiveis = gerarHorariosDisponiveis(
    dataSelecionada,
    servicoSelecionado
  );

  if (!horariosDisponiveis.length) {
    campoHorario.innerHTML =
      '<option value="">Nenhum horário disponível</option>';
    campoHorario.value = "";
    return;
  }

  campoHorario.innerHTML = '<option value="">Selecione</option>';

  horariosDisponiveis.forEach((horario) => {
    const option = document.createElement("option");
    option.value = horario;
    option.textContent = horario;
    campoHorario.appendChild(option);
  });

  if (campoHorario.value && !horariosDisponiveis.includes(campoHorario.value)) {
    campoHorario.value = "";
  }
}

function ouvirHorariosDaData(dataSelecionada) {
  if (unsubscribeHorarios) {
    unsubscribeHorarios();
    unsubscribeHorarios = null;
  }

  if (!dataSelecionada) {
    agendamentosDoDia = [];
    atualizarSelectHorarios();
    return;
  }

  if (datasBloqueadas.includes(dataSelecionada)) {
    agendamentosDoDia = [];
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
      agendamentosDoDia = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));

      atualizarSelectHorarios();
    },
    (error) => {
      console.error("Erro ao carregar horários:", error);
      mostrarErro(
        campoHorario,
        erroHorario,
        "Não foi possível carregar os horários."
      );
    }
  );
}

function ouvirDatasBloqueadas() {
  onSnapshot(
    collection(db, "datas_bloqueadas"),
    (snapshot) => {
      datasBloqueadas = snapshot.docs
        .map((item) => item.data()?.data)
        .filter(Boolean);

      atualizarCalendarioComBloqueios();
    },
    (error) => {
      console.error("Erro ao carregar datas bloqueadas:", error);
    }
  );
}

function limparTodosErros() {
  limparErro(campoNome, erroNome);
  limparErro(campoEmail, erroEmail);
  limparErro(campoData, erroData);
  limparErro(campoHorario, erroHorario);
  limparErro(campoServico, erroServico);
  limparErro(inputQuantidade, erroQuantidade);
}

[campoNome, campoEmail, campoData, campoHorario, campoServico, inputQuantidade].forEach((campo) => {
  campo.addEventListener("input", () => {
    if (campo === campoNome) limparErro(campoNome, erroNome);
    if (campo === campoEmail) limparErro(campoEmail, erroEmail);
    if (campo === campoData) limparErro(campoData, erroData);
    if (campo === campoHorario) limparErro(campoHorario, erroHorario);
    if (campo === campoServico) limparErro(campoServico, erroServico);
    if (campo === inputQuantidade) limparErro(inputQuantidade, erroQuantidade);
  });

  campo.addEventListener("change", () => {
    if (campo === campoNome) limparErro(campoNome, erroNome);
    if (campo === campoEmail) limparErro(campoEmail, erroEmail);
    if (campo === campoData) limparErro(campoData, erroData);
    if (campo === campoHorario) limparErro(campoHorario, erroHorario);
    if (campo === campoServico) limparErro(campoServico, erroServico);
    if (campo === inputQuantidade) limparErro(inputQuantidade, erroQuantidade);
  });
});

campoData.addEventListener("change", () => {
  limparErro(campoData, erroData);
  limparErro(campoHorario, erroHorario);
  campoHorario.value = "";
  ouvirHorariosDaData(campoData.value);
});

campoServico.addEventListener("change", () => {
  limparErro(campoServico, erroServico);
  limparErro(campoHorario, erroHorario);
  campoHorario.value = "";
  atualizarVisibilidadeQuantidade();
  atualizarSelectHorarios();
});

inputQuantidade.addEventListener("input", () => {
  limparErro(inputQuantidade, erroQuantidade);
  limparErro(campoHorario, erroHorario);
  campoHorario.value = "";
  atualizarSelectHorarios();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const nome = campoNome.value.trim();
  const email = campoEmail.value.trim();
  const data = campoData.value;
  const horario = campoHorario.value;
  const servico = campoServico.value;
  const observacao = campoObservacao.value.trim();
  const quantidade = obterQuantidadeReposicao();

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
  } else if (datasBloqueadas.includes(data)) {
    mostrarErro(campoData, erroData, "Essa data não está disponível.");
    formularioValido = false;
  }

  if (!servico) {
    mostrarErro(campoServico, erroServico, "Selecione um serviço.");
    formularioValido = false;
  }

  if (servico === "Reposição de unha" && !quantidade) {
    mostrarErro(inputQuantidade, erroQuantidade, "Informe a quantidade.");
    formularioValido = false;
  }

  if (!horario) {
    mostrarErro(campoHorario, erroHorario, "Escolha um horário.");
    formularioValido = false;
  }

  if (!formularioValido) return;

  let dadosServico;

  if (servico === "Reposição de unha") {
    dadosServico = {
      preco: quantidade * 15,
      duracao: quantidade * 20
    };
  } else {
    dadosServico = servicos[servico];
  }

  if (!dadosServico) {
    mostrarErro(campoServico, erroServico, "Serviço inválido.");
    return;
  }

  const dataFormatada = new Date(`${data}T00:00:00`).toLocaleDateString("pt-BR");
  const idAgendamento = gerarIdAgendamento(data, horario);
  const refAgendamento = doc(db, "agendamentos", idAgendamento);
  const refDataBloqueada = doc(db, "datas_bloqueadas", data);

  const novoAgendamento = {
    id: idAgendamento,
    nome,
    email,
    data: dataFormatada,
    dataOriginal: data,
    horario,
    servico,
    quantidade: servico === "Reposição de unha" ? quantidade : null,
    preco: dadosServico.preco,
    duracao: dadosServico.duracao,
    observacao: observacao || "Nenhuma",
    status: "pendente",
    criadoEm: new Date().toISOString()
  };

  try {
    await runTransaction(db, async (transaction) => {
      const snapshotDoMesmoHorario = await transaction.get(refAgendamento);
      const snapshotDataBloqueada = await transaction.get(refDataBloqueada);

      if (snapshotDataBloqueada.exists()) {
        throw new Error("DATA_BLOQUEADA");
      }

      if (snapshotDoMesmoHorario.exists()) {
        throw new Error("HORARIO_OCUPADO");
      }

      const agendamentosConflitantes = agendamentosDoDia.filter((agendamento) => {
        const inicioExistente = horarioParaMinutos(agendamento.horario);
        const duracaoExistente =
          Number(agendamento.duracao) || obterDuracaoServico(agendamento.servico);
        const fimExistente = inicioExistente + duracaoExistente;

        const inicioNovo = horarioParaMinutos(horario);
        const fimNovo = inicioNovo + dadosServico.duracao;

        return horariosConflitam(
          inicioNovo,
          fimNovo,
          inicioExistente,
          fimExistente
        );
      });

      if (agendamentosConflitantes.length) {
        throw new Error("CONFLITO_HORARIO");
      }

      transaction.set(refAgendamento, novoAgendamento);
    });

    localStorage.setItem("agendamento", JSON.stringify(novoAgendamento));
    window.location.href = "confirmacao.html";
  } catch (error) {
    console.error("Erro ao salvar agendamento:", error);

    if (error.message === "DATA_BLOQUEADA") {
      mostrarErro(campoData, erroData, "Essa data foi bloqueada pela administração.");
      return;
    }

    if (
      error.message === "HORARIO_OCUPADO" ||
      error.message === "CONFLITO_HORARIO"
    ) {
      mostrarErro(
        campoHorario,
        erroHorario,
        "Esse horário acabou de ser ocupado. Escolha outro."
      );
      ouvirHorariosDaData(data);
      return;
    }

    alert("Não foi possível concluir o agendamento. Tente novamente.");
  }
});

configurarCalendario();
atualizarVisibilidadeQuantidade();
atualizarSelectHorarios();
ouvirDatasBloqueadas();