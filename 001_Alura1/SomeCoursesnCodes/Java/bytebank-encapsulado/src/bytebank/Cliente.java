package bytebank;

public class Cliente {
	private String nome;
	private String cpf;
	private String profissao;

	public void setNome(String nome) {
		this.nome = nome;
	}
	
	public String getNome() {
		return nome;
	}

	public String getCpf() { // Deste para baixo criados no menu Source e Generate Getters and Setters
		return cpf;
	}

	public void setCpf(String cpf) {
		this.cpf = cpf;
	}

	public String getProfissao() {
		return profissao;
	}

	public void setProfissao(String profissao) {
		this.profissao = profissao;
	}

}
