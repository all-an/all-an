
  // !!!!!! NÃO USAR ESTA CLASSE, APENAS PARA FINS DE ESTUDO !!!!

//não usar esta classe, somente estudo, referência para o que não fazer

package herdado;

public class FuncionarioTeste {
	private String nome;
	private String cpf;
	private double salario;
	//atributos da classe que pertencem a possíveis outras classes, gerarão códigos sujos e grandes
	private int tipo = 0; //0 = Funcionario Comum / 1 = Gerente / 2 = Diretor
	private int senha;
	
	public boolean autentica(int senha) { //código sujo, se repetirá para cada tipo gerando ifs gigantes
		if(this.senha == senha) {
			return true;
		} else {
			return false;
		}
	}
	
	//este get ficará enorme com múltiplos ifs para os tipos, código sujo
	public double getBonificacao() {  //get foi usado somente como nome do metodo mas não se refere a um atributo
		if(this.tipo == 0) {
			return this.salario * 0.1;
		} else if ( this.tipo == 1){
			return this.salario;
		} else {
			return this.salario + 1000.00;
		}
		
	}
	
	public String getNome() {
		return nome;
	}
	
	public void setNome(String nome) {
		this.nome = nome;
	}
	public String getCpf() {
		return cpf;
	}
	public void setCpf(String cpf) {
		this.cpf = cpf;
	}
	public double getSalario() {
		return salario;
	}
	public void setSalario(double salario) {
		this.salario = salario;
	}
	
	public void setTipo(int tipo) {
		this.tipo = tipo;
	}
	
	public int getTipo() {
		return tipo;
	}

}
