
  // !!!!!! N�O USAR ESTA CLASSE, APENAS PARA FINS DE ESTUDO !!!!

//n�o usar esta classe, somente estudo, refer�ncia para o que n�o fazer

package herdado;

public class FuncionarioTeste {
	private String nome;
	private String cpf;
	private double salario;
	//atributos da classe que pertencem a poss�veis outras classes, gerar�o c�digos sujos e grandes
	private int tipo = 0; //0 = Funcionario Comum / 1 = Gerente / 2 = Diretor
	private int senha;
	
	public boolean autentica(int senha) { //c�digo sujo, se repetir� para cada tipo gerando ifs gigantes
		if(this.senha == senha) {
			return true;
		} else {
			return false;
		}
	}
	
	//este get ficar� enorme com m�ltiplos ifs para os tipos, c�digo sujo
	public double getBonificacao() {  //get foi usado somente como nome do metodo mas n�o se refere a um atributo
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
